import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * `pub-*.r2.dev` er Cloudflares DEV-domene for R2 og er ratebegrenset
 * («should only be used for development purposes»). Facebooks henting av
 * videoen derfra tok 2+ minutter og feilet helt da dagens kvote var brukt
 * opp (22.08.2026: tre publiseringer stoppet på rad).
 *
 * Denne bytter dev-URL-en mot en presignert URL rett mot R2-endepunktet
 * (målt 0,6 s). Ingen lagrede URL-er endres — omskrivingen skjer bare i det
 * øyeblikket en URL gis videre til en ekstern plattform, og bare for
 * plattformer som laster ned fila én gang (Facebook, Instagram).
 *
 * Faller alltid tilbake til original-URL-en: mangler R2-nøklene, eller er
 * verten en annen enn dev-domenet, returneres input uendret.
 */
const R2_DEV_HOST = 'pub-5dcdfe9305a740febc87568c9ccb40a6.r2.dev'

export async function hentbarMediaUrl(url: string): Promise<string> {
  try {
    const u = new URL(url)
    if (u.hostname !== R2_DEV_HOST) return url

    const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env
    if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) return url

    const key = decodeURIComponent(u.pathname.replace(/^\//, ''))
    const r2 = new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    })
    const signert = await getSignedUrl(r2, new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }), {
      expiresIn: 3600,
    })
    console.log('[r2Presign] Omskrev dev-URL til presignert R2-URL:', key)
    return signert
  } catch (err) {
    console.error('[r2Presign] Presign feilet, bruker original URL:', err)
    return url
  }
}

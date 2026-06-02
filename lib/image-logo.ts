import sharp from 'sharp'

// Logo URL is passed directly in the API request from the frontend
// (which has authenticated Supabase access), avoiding RLS issues server-side.

export async function compositeLogoOnImage(imageBuffer: Buffer, logoUrl: string): Promise<Buffer> {
  try {
    const logoRes = await fetch(logoUrl)
    if (!logoRes.ok) return imageBuffer
    const logoRaw = Buffer.from(await logoRes.arrayBuffer())

    const LOGO_MAX_WIDTH = 140
    const LOGO_MAX_HEIGHT = 60
    const PADDING = 12
    const MARGIN = 20
    const RADIUS = 10

    const logoResized = await sharp(logoRaw)
      .resize(LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
      .toBuffer()

    const logoMeta = await sharp(logoResized).metadata()
    const lw = logoMeta.width ?? LOGO_MAX_WIDTH
    const lh = logoMeta.height ?? LOGO_MAX_HEIGHT
    const bgW = lw + PADDING * 2
    const bgH = lh + PADDING * 2

    const bgSvg = Buffer.from(
      `<svg width="${bgW}" height="${bgH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${bgW}" height="${bgH}" rx="${RADIUS}" ry="${RADIUS}" fill="white" fill-opacity="0.88"/>
      </svg>`
    )

    const badge = await sharp(bgSvg)
      .composite([{ input: logoResized, left: PADDING, top: PADDING }])
      .png()
      .toBuffer()

    const imgMeta = await sharp(imageBuffer).metadata()
    const imgW = imgMeta.width ?? 1024
    const imgH = imgMeta.height ?? 1024

    return await sharp(imageBuffer)
      .composite([{ input: badge, left: imgW - bgW - MARGIN, top: imgH - bgH - MARGIN }])
      .png()
      .toBuffer()
  } catch (err) {
    console.error('[image-logo] Composite failed (skipping):', err)
    return imageBuffer
  }
}

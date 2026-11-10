/**
 * Netlify Scheduled Function — hver natt kl. 03:00 norsk vintertid (02:00 UTC).
 * Starter de automatiske testfilmene (lib/testfilmer.ts). Feil fanges av
 * produksjonsvakten; resultatet står i morgenoppsummeringen kl. 07.
 */

export default async () => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app'
  try {
    const res = await fetch(`${baseUrl}/api/varsel/testfilmer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
    })
    const data = await res.json().catch(() => ({}))
    console.log('[cron-testfilmer]', res.status, JSON.stringify(data))
    return new Response(JSON.stringify(data), { status: 200 })
  } catch (err) {
    console.error('[cron-testfilmer] feil:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}

export const config = {
  schedule: '0 2 * * *',
}

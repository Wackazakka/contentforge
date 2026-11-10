/**
 * Netlify Scheduled Function — hver morgen kl. 07:00 norsk vintertid (06:00 UTC).
 * Sender Lars morgenoppsummeringen (/api/varsel/daglig-oppsummering).
 */

export default async () => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app'
  try {
    const res = await fetch(`${baseUrl}/api/varsel/daglig-oppsummering`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
    })
    const data = await res.json().catch(() => ({}))
    console.log('[cron-daglig-oppsummering]', res.status, JSON.stringify(data))
    return new Response(JSON.stringify(data), { status: 200 })
  } catch (err) {
    console.error('[cron-daglig-oppsummering] feil:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}

export const config = {
  schedule: '0 6 * * *',
}

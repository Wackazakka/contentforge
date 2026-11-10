/**
 * Netlify Scheduled Function — hvert 10. minutt (Lars 10.11.2026).
 * Kaller /api/varsel/produksjon-vakt, som finner filmer som har stoppet opp
 * (krasj, omstart, droplet nede, henger) og varsler. Kjører hos Netlify med
 * vilje: vakten skal virke også når dropleten selv er nede.
 */

export default async () => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app'
  try {
    const res = await fetch(`${baseUrl}/api/varsel/produksjon-vakt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
    })
    const data = await res.json().catch(() => ({}))
    console.log('[cron-produksjonsvakt]', res.status, JSON.stringify(data))
    return new Response(JSON.stringify(data), { status: 200 })
  } catch (err) {
    console.error('[cron-produksjonsvakt] feil:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}

export const config = {
  schedule: '*/10 * * * *',
}

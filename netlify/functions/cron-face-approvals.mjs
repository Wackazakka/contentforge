/**
 * Netlify Scheduled Function (v2) — fyrer én gang i døgnet, 08:00 UTC.
 *
 * Kaller /api/cron/face-approvals, som purrer på ansiktsmodeller som venter
 * på rettighetshaverens godkjenning (migrasjon 092).
 *
 * DAGLIG, IKKE OFTERE. Trinnene er dag 3 og dag 10 — en finere klokke enn
 * det ville bare gitt flere kall som ikke gjør noe. Og en purring er en
 * e-post til et menneske; den skal ikke kunne gå ut to ganger fordi sveipet
 * løp igjen før databasen var oppdatert.
 */

export default async () => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://twinledger.ai'
  try {
    const res = await fetch(`${baseUrl}/api/cron/face-approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
    })
    const data = await res.json()
    console.log('[cron-face-approvals]', JSON.stringify(data))
    return new Response(JSON.stringify(data), { status: 200 })
  } catch (err) {
    console.error('[cron-face-approvals] feilet:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}

export const config = {
  schedule: '0 8 * * *',
}

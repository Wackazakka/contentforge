/**
 * Netlify Scheduled Function (v2) — hvert tiende minutt.
 *
 * Kaller /api/cron/face-training, som spoer fal om status paa alle
 * ansiktstreninger som paagaar, flipper ferdige til «ready», lager de tre
 * proevebildene og sender rettighetshaveren godkjenningsmailen (091).
 *
 * TI MINUTTER, IKKE ETT. En trening tar 20–40 minutter; finere klokke gir
 * bare flere kall som ikke gjoer noe, og fal-status er et nettverkskall per
 * rad. Og ti minutter er kort nok til at ingen venter paa e-posten sin
 * lenger enn de ville ventet paa en admin som klikket.
 */

export default async () => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://twinledger.ai'
  try {
    const res = await fetch(`${baseUrl}/api/cron/face-training`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET || '' },
    })
    const data = await res.json()
    console.log('[cron-face-training]', JSON.stringify(data))
    return new Response(JSON.stringify(data), { status: 200 })
  } catch (err) {
    console.error('[cron-face-training] feilet:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}

export const config = {
  schedule: '*/10 * * * *',
}

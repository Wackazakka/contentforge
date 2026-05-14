/**
 * Netlify Scheduled Function (v2) — fires every 10 minutes.
 * Calls /api/cron/publish-scheduled to publish any rows in
 * scheduled_publications that are past their scheduled_at time.
 */

export default async () => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app'

  try {
    const res = await fetch(`${baseUrl}/api/cron/publish-scheduled`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': process.env.CRON_SECRET || '',
      },
    })

    const data = await res.json()
    console.log('[cron-publish] Result:', JSON.stringify(data))

    return new Response(JSON.stringify(data), { status: 200 })
  } catch (err) {
    console.error('[cron-publish] Error calling publish endpoint:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
}

export const config = {
  schedule: '* * * * *',
}

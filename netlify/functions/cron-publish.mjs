/**
 * Netlify Scheduled Function — fires every 10 minutes to publish
 * any rows in scheduled_publications that are past their scheduled_at time.
 *
 * Schedule is configured in netlify.toml:
 *   [functions."cron-publish"]
 *     schedule = "*/10 * * * *"
 */

export const handler = async () => {
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

    return {
      statusCode: 200,
      body: JSON.stringify(data),
    }
  } catch (err) {
    console.error('[cron-publish] Error calling publish endpoint:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(err) }),
    }
  }
}

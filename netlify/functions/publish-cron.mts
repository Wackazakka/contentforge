import type { Config } from '@netlify/functions'

// Runs every minute
export default async function handler() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://contentforge-610.netlify.app'
  const secret = process.env.CRON_SECRET

  const res = await fetch(`${baseUrl}/api/cron/publish-scheduled`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
  })

  const data = await res.json()
  console.log('[publish-cron] Result:', data)
}

export const config: Config = {
  schedule: '* * * * *',
}

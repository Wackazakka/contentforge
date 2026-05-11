import { createClient } from '@supabase/supabase-js'
import { CREDIT_COSTS } from './stripe'

const LOW_CREDITS_THRESHOLD = 15

export async function checkAndDeductCredits(
  userId: string,
  type: keyof typeof CREDIT_COSTS,
  description: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const cost = CREDIT_COSTS[type]

  // Get balance before deduction to detect threshold crossing
  const { data: before } = await supabase
    .from('user_credits')
    .select('balance')
    .eq('user_id', userId)
    .single()

  const { data, error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: cost,
    p_type: type,
    p_description: description,
  })

  if (error) {
    console.error('[credits] deduct_credits error:', error)
    return { ok: false, error: 'Credit deduction failed' }
  }

  if (!data) {
    return { ok: false, error: `Not enough credits (requires ${cost})` }
  }

  // Check if balance just crossed below threshold and send warning
  const balanceBefore = before?.balance ?? 0
  if (balanceBefore >= LOW_CREDITS_THRESHOLD) {
    const { data: after } = await supabase
      .from('user_credits')
      .select('balance')
      .eq('user_id', userId)
      .single()

    const balanceAfter = after?.balance ?? 0
    if (balanceAfter < LOW_CREDITS_THRESHOLD) {
      // Crossed threshold — send warning (fire and forget)
      supabase.auth.admin.getUserById(userId).then(({ data: userData }) => {
        if (!userData?.user?.email) return
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://contentforge-610.netlify.app'
        fetch(`${baseUrl}/api/email/low-credits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userData.user.email,
            name: userData.user.user_metadata?.full_name ?? '',
            balance: balanceAfter,
          }),
        }).catch(() => {})
      }).catch(() => {})
    }
  }

  return { ok: true }
}

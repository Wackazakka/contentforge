import { createClient } from '@supabase/supabase-js'
import { CREDIT_COSTS } from './stripe'

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

  const { data, error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: cost,
    p_type: type,
    p_description: description,
  })

  if (error) {
    console.error('[credits] deduct_credits error:', error)
    return { ok: false, error: 'Feil ved kredittrekk' }
  }

  if (!data) {
    return { ok: false, error: `Ikke nok kreditter (krever ${cost})` }
  }

  return { ok: true }
}

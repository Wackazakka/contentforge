import { getSupabase } from '@/lib/supabaseClient'

// Authorization-header med den innloggede brukerens token, eller tomt objekt.
// For kall fra nettleseren til ruter som krever innlogging (f.eks.
// /api/content/generate-image fra 21.10.2026).
export async function innloggingHeader(): Promise<Record<string, string>> {
  try {
    const token = (await getSupabase().auth.getSession()).data?.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

import { getSupabase } from '@/lib/supabaseClient'

// fetch med sesjonen (25.10.2026). Rutene som før tok imot `userId` fra
// klienten, leser nå brukeren fra tokenet — så kallerne må sende det.
// Uten innlogging går kallet uten header, og ruta svarer 401.
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  let token = ''
  try {
    const { data } = await getSupabase().auth.getSession()
    token = data?.session?.access_token || ''
  } catch { /* ingen sesjon */ }
  const headers = new Headers(init?.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}

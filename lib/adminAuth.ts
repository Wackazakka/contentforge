import { createClient } from '@supabase/supabase-js'

/**
 * Plattform-admin: verifiser en EKTE sesjon, ikke en id fra forespørselen.
 *
 * ⚠️ Bakgrunn (funnet 2026-08-07): /api/admin/{stats,users,credits} tok
 * `userId` fra query eller body og slo opp e-posten på den brukeren. Men id-en
 * kom fra klienten og var aldri bevist. Kjente du en admins UUID — og de er
 * ikke hemmelige; de ligger i org-rader og API-svar — var du admin. Bevist i
 * produksjon: `GET /api/admin/stats?userId=<admin-uuid>` svarte 200 med data
 * uten noen innlogging, og `POST /api/admin/credits` kunne gitt hvem som helst
 * ubegrenset kreditt.
 *
 * Regelen: identitet kommer fra Authorization-headeren, aldri fra en parameter.
 */

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'kilevold@online.no')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export type AdminSjekk = { ok: true; email: string; userId: string } | { ok: false; status: 401 | 403 }

export async function krevPlattformAdmin(request: Request): Promise<AdminSjekk> {
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return { ok: false, status: 401 }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await supabase.auth.getUser(token)
    const email = (data?.user?.email || '').toLowerCase()
    if (!email) return { ok: false, status: 401 }
    if (!ADMIN_EMAILS.includes(email)) return { ok: false, status: 403 }
    return { ok: true, email, userId: data!.user!.id }
  } catch {
    return { ok: false, status: 401 }
  }
}

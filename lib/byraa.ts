import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { erGyldigNoekkel } from '@/lib/identitet'

// Byråenes påmeldingslenke (116, 25.10.2026) — serverdelen.
//
// 🔑 BYRÅET GÅR GOD FOR DEN SOM KOMMER GJENNOM LENKEN, OG SER HVEM DET ER.
// Lenken er en nøkkel: lekker den, kan hvem som helst bruke den. Derfor får
// byrået en e-post for hver påmelding, med navnet og en lenke «Ikke vår
// klient» som trekker bekreftelsen. Uten den e-posten ville en lekket lenke
// gitt stille tilgang til «bekreftet identitet».
//
// 🔑 KOBLINGEN AVGJØRES PÅ SERVEREN, ALDRI FRA BRUKERENS METADATA. Påmeldingen
// bærer radens innhold i user_metadata til første innlogging (101) — og den
// kan brukeren endre selv. Byrået legges derfor i app_metadata, som bare
// serveren kan skrive, og sjekkes på nytt når raden lages.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

export interface Byraa { id: string; tenant_id: string; name: string; contact_email: string | null; is_active: boolean }

export const nyNoekkel = () => randomBytes(18).toString('base64url')

/** Det aktive byrået bak en lenke-nøkkel i denne banken, eller null. */
export async function byraaForNoekkel(token: unknown, tenantId: string): Promise<Byraa | null> {
  if (!erGyldigNoekkel(token)) return null
  const { data } = await db().from('talent_agents')
    .select('id, tenant_id, name, contact_email, is_active')
    .eq('enroll_token', token).eq('tenant_id', tenantId).eq('is_active', true).maybeSingle()
  return (data as Byraa | null) ?? null
}

export async function byraaMedId(id: unknown, tenantId: string): Promise<Byraa | null> {
  if (typeof id !== 'string' || !id) return null
  const { data } = await db().from('talent_agents')
    .select('id, tenant_id, name, contact_email, is_active')
    .eq('id', id).eq('tenant_id', tenantId).eq('is_active', true).maybeSingle()
  return (data as Byraa | null) ?? null
}

/** Feltene en rad får når byrået går god for henne. */
export function byraaFelter(agentId: string) {
  return {
    identity_basis: 'vouched' as const,
    talent_agent_id: agentId,
    identity_confirmed_by: `agent:${agentId}`,
    identity_confirmed_at: new Date().toISOString(),
    agent_objection_token: nyNoekkel(),
  }
}

/**
 * Sier fra til byrået at noen meldte seg på gjennom lenken deres.
 * Resend kaster ikke — en avvist sending kommer som { error }, og da logges den.
 */
export async function varsleByraa(opts: {
  byraa: Byraa; navn: string; epost: string; innsigelse: string; origin: string; merke: string
}): Promise<boolean> {
  const { byraa, navn, epost, innsigelse, origin, merke } = opts
  if (!byraa.contact_email || !process.env.RESEND_API_KEY) return false
  try {
    const { Resend } = await import('resend')
    const lenke = `${origin.replace(/\/+$/, '')}/byraa/innsigelse/${encodeURIComponent(innsigelse)}`
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `${merke} <no-reply@send.norditech.io>`,
      to: byraa.contact_email,
      subject: `${navn} meldte seg på gjennom lenken deres`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1A16">
        <p><strong>${esc(navn)}</strong> (${esc(epost)}) meldte seg på ${esc(merke)} gjennom påmeldingslenken til ${esc(byraa.name)}.</p>
        <p>Fordi lenken kom fra dere, regnes identiteten som bekreftet av byrået. Profilen kan da publiseres uten BankID.</p>
        <p>Kjenner dere ikke personen?</p>
        <p style="margin:20px 0"><a href="${lenke}" style="background:#1C1A16;color:#fff;padding:10px 18px;text-decoration:none;font-weight:600">Ikke vår klient</a></p>
        <p style="color:#6B6358;font-size:14px">Da trekkes bekreftelsen, og profilen kan ikke publiseres før identiteten er bekreftet på en annen måte.</p>
      </div>`,
    })
    if (error) throw new Error(`${error.name}: ${error.message}`)
    return true
  } catch (e) {
    console.error('[byraa] Varsel feilet:', e instanceof Error ? e.message : e)
    return false
  }
}

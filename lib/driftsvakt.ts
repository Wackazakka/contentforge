import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { SUPPORT_MOTTAKER } from '@/lib/support'

// Driftsvakten (migrasjon 110, Lars 23.10.2026): «Det kan være kritisk
// framover hvis en av dem slipper opp for credits.» To innganger:
//  1) /api/admin/driftsvakt kjøres hver time fra dropleten og leser saldoen
//     der leverandøren har API for det (fal, ElevenLabs).
//  2) rapporterLeverandorfeil() kalles der appen får feil fra en leverandør,
//     og varsler med en gang hvis feilen betyr tom saldo/kvote — det fanger
//     også OpenAI og Anthropic, som ikke har noe saldo-API.
// Samme sak (nokkel) varsles maks én gang per døgn.

const MOTTAKER = SUPPORT_MOTTAKER

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Feiltekster som betyr «tom for kreditt/kvote» hos leverandørene vi bruker
const SALDOFEIL = /insufficient[_ ]quota|billing[_ ]hard[_ ]limit|credit balance (is )?too low|quota[_ ]exceeded|exhausted balance|insufficient (funds|credits|balance)|payment required|out of credits|not enough credits/i

export function erSaldofeil(tekst: string): boolean {
  return SALDOFEIL.test(tekst)
}

// Hvor man fyller på — lenken står i varselet
export const PAAFYLL: Record<string, string> = {
  fal: 'https://fal.ai/dashboard/billing',
  ElevenLabs: 'https://elevenlabs.io/app/subscription',
  OpenAI: 'https://platform.openai.com/settings/organization/billing',
  Anthropic: 'https://console.anthropic.com/settings/billing',
}

/**
 * Send et varsel til Lars, maks én gang per døgn per nokkel.
 * Returnerer true hvis e-posten faktisk ble sendt nå.
 */
export async function varsle(opts: { nokkel: string; kilde: string; emne: string; tekst: string; tving?: boolean }): Promise<boolean> {
  const sb = admin()
  if (!opts.tving) {
    const etDognSiden = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { count } = await sb.from('driftsvarsler').select('id', { count: 'exact', head: true })
      .eq('nokkel', opts.nokkel).eq('epost_sendt', true).gte('created_at', etDognSiden)
    if ((count || 0) > 0) return false
  }
  const { data: rad } = await sb.from('driftsvarsler')
    .insert({ nokkel: opts.nokkel, kilde: opts.kilde, emne: opts.emne, tekst: opts.tekst })
    .select('id').single()
  const lenke = PAAFYLL[opts.kilde]
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1C1A16;max-width:620px;">
  <p style="margin:0 0 12px;">${esc(opts.tekst).replace(/\n/g, '<br>')}</p>
  ${lenke ? `<p style="margin:0 0 12px;"><a href="${lenke}" style="color:#B5179E;font-weight:600;">Fyll på hos ${esc(opts.kilde)} →</a></p>` : ''}
  <p style="margin:18px 0 0;font-size:12.5px;color:#978B79;">Driftsvakten sjekker saldoene hver time og varsler maks én gang per døgn per sak.</p>
</div>`
  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'Norditech driftsvakt <no-reply@send.norditech.io>',
      to: MOTTAKER,
      subject: `⚠️ ${opts.emne}`,
      html,
    })
    if (error) throw new Error(error.message)
    if (rad) await sb.from('driftsvarsler').update({ epost_sendt: true }).eq('id', rad.id)
    return true
  } catch (err) {
    console.error('[driftsvakt] e-post feilet:', err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Kalles der en leverandør har feilet. Varsler bare hvis feilen betyr tom
 * saldo/kvote; alt annet er vanlige feil og ignoreres her. Kaster aldri.
 */
export async function rapporterLeverandorfeil(kilde: string, feil: unknown): Promise<void> {
  try {
    const tekst = feil instanceof Error ? feil.message : String(feil)
    if (!erSaldofeil(tekst)) return
    await varsle({
      nokkel: `${kilde}:tom`,
      kilde,
      emne: `${kilde} er tom for kreditt – brukerne får feil`,
      tekst: `${kilde} avviste et kall fordi kontoen er tom for kreditt eller kvote. Brukerne får feilmelding til det er fylt på.\n\nFeilen: ${tekst.slice(0, 400)}`,
    })
  } catch { /* varselet skal aldri velte kallet som feilet */ }
}

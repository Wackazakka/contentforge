import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Purring på ubesvarte ansiktsgodkjenninger (migrasjon 092).
//
// 🔑 INGEN AUTOMATISK JA. Stemmesidens godkjenninger har timeout som sier ja
// hvis ingen svarer — fordi det gjelder ÉN bruk med en frist kunden må rekke.
// Her gjelder det grunnlaget: om et menneskes ansikt i det hele tatt kan
// brukes. Taushet kan aldri bli et ja til det. Sveipet gjør spørsmålet
// synlig; det svarer aldri på hennes vegne.
//
// 🔑 TO PURRINGER, SÅ STILLHET. Dag 3 og dag 10. Deretter slutter vi å mase
// og forteller adminen i stedet — da er det et menneskeproblem, ikke et
// e-postproblem, og noen bør ta en telefon. Endeløs purring er sin egen skade.

const DAG = 24 * 3600_000
/** Når purring nummer 1 og 2 går ut, regnet fra da varselet ble sendt. */
const TRINN_DAGER = [3, 10]

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function sendEpost(til: string | string[], emne: string, html: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false
  try {
    const { Resend } = await import('resend')
    // Resend kaster ikke — en avvist sending kommer som `{ error }`. Uten
    // denne sjekken ble purringen bokfoert som sendt uansett (samme feil som
    // i varsleOmGodkjenning, funnet 22.09).
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'TwinLedger <no-reply@send.norditech.io>', to: til, subject: emne, html,
    })
    if (error) { console.error('[face-approvals] e-post avvist:', error); return false }
    return true
  } catch { return false }
}

async function kjor(request?: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && request) {
    const gitt = request.headers.get('x-cron-secret') || new URL(request.url).searchParams.get('secret')
    if (gitt !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = admin()
  const { data, error } = await db
    .from('user_characters')
    .select('id, name, subject_email, approval_token, approval_sent_at, approval_reminders, owner_tenant_id')
    .eq('approval_status', 'pending')
    .not('approval_sent_at', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const naa = Date.now()
  let purret = 0
  let varslet = 0

  for (const r of data || []) {
    const dager = (naa - new Date(r.approval_sent_at as string).getTime()) / DAG
    const sendt = Number(r.approval_reminders) || 0
    if (sendt >= TRINN_DAGER.length) continue        // ferdig purret — se toppen
    if (dager < TRINN_DAGER[sendt]) continue         // ikke tid ennå
    if (!r.subject_email || !r.approval_token) continue

    // ⚠️ VERTEN UTLEDES FRA TENANTEN, ikke fra NEXT_PUBLIC_BASE_URL. Den
    // peker paa Netlify-domenet, og der ville hun landet paa en side med feil
    // merkevare — tenanten avgjoeres av verten. En som er rekruttert til
    // TwinLedger skal ikke faa en lenke som ser ut som noe annet.
    const { data: tv } = await db.from('tenants')
      .select('custom_domain, slug').eq('id', r.owner_tenant_id).maybeSingle()
    const vert = tv?.custom_domain
      ? `https://${tv.custom_domain}`
      : `https://${tv?.slug || 'twinledger'}.norditech.io`
    const lenke = `${vert}/godkjenn-ansikt/${r.approval_token}`
    const sisteGang = sendt + 1 >= TRINN_DAGER.length

    const ok = await sendEpost(
      r.subject_email as string,
      'Påminnelse: ansiktsmodellen din venter på svar',
      `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1A16">
        <h2 style="margin:0 0 12px">Er dette deg?</h2>
        <p>Vi spurte for ${Math.round(dager)} dager siden om du ville se på ansiktsmodellen${r.name ? ` («${r.name}»)` : ''} vi har laget fra bildene dine.</p>
        <p><strong>Den er fortsatt stengt</strong>, og kan ikke brukes til noe før du har sett prøvebildene og sagt ja.</p>
        <p style="margin:24px 0"><a href="${lenke}" style="background:#C5451B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Se bildene og svar</a></p>
        <p style="color:#6B6358;font-size:14px">${sisteGang
          ? 'Dette er siste påminnelse fra oss. Svarer du ikke, blir modellen stående stengt — vi tolker aldri taushet som et ja.'
          : 'Du kan svare når det passer. Vi minner deg på det én gang til.'}</p>
      </div>`
    )
    if (!ok) continue

    await db.from('user_characters').update({
      approval_reminders: sendt + 1,
      approval_reminded_at: new Date().toISOString(),
    }).eq('id', r.id)
    purret++

    // Siste purring: adminen får beskjed. Etter dette er det ingen flere
    // e-poster — noen må ta en telefon i stedet.
    if (sisteGang) {
      const { data: t } = await db.from('tenants')
        .select('admin_emails').eq('id', r.owner_tenant_id).maybeSingle()
      const til = (Array.isArray(t?.admin_emails) ? t!.admin_emails : [])
        .map((e: unknown) => String(e).trim()).filter((e: string) => e.includes('@'))
      if (til.length > 0) {
        await sendEpost(til, `Ubesvart godkjenning: ${r.name || 'ansiktsmodell'}`,
          `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1A16">
            <h2 style="margin:0 0 12px">Ingen har svart</h2>
            <p><strong>${r.name || 'En ansiktsmodell'}</strong> har ventet på godkjenning i ${Math.round(dager)} dager. Vi har purret to ganger på ${r.subject_email} og slutter nå.</p>
            <p>Modellen står stengt og kan ikke brukes. Skal den tas i bruk, må noen snakke med henne.</p>
          </div>`)
        varslet++
      }
    }
  }

  return NextResponse.json({ ok: true, sett: (data || []).length, purret, adminVarslet: varslet })
}

export async function POST(request: NextRequest) { return kjor(request) }
export async function GET(request: NextRequest) { return kjor(request) }

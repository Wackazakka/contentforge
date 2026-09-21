import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const FAL_KEY = process.env.CONTENTFORGE_FAL_KEY

/**
 * Be rettighetshaveren godkjenne modellen av ansiktet sitt (091).
 *
 * 🔑 LENKEN ER HENNES AUTENTISERING. Hen har ingen konto hos oss og skal ikke
 * trenge en for aa svare paa om ansiktet sitt kan brukes.
 *
 * Feiler stille: modellen staar som `pending`, altsaa STENGT. Det verste en
 * mislykket e-post kan gjoere er aa utsette et ja -- ikke aa slippe noe gjennom.
 */
async function varsleOmGodkjenning(karakterId: string, til: string, token: string, navn: string | null): Promise<void> {
  try {
    if (!process.env.RESEND_API_KEY) return
    const { getTenant } = await import('@/lib/tenantServer')
    const t = await getTenant()
    const vert = t.custom_domain ? `https://${t.custom_domain}` : `https://${t.slug}.norditech.io`
    const lenke = `${vert}/godkjenn-ansikt/${token}`
    const merke = t.app_name || 'TwinLedger'
    const { Resend } = await import('resend')
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: `${merke} <hello@centerforge.app>`,
      to: til,
      subject: 'Er dette deg? Godkjenn ansiktsmodellen din',
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1A16">
        <h2 style="margin:0 0 12px">Er dette deg?</h2>
        <p>Vi har laget en ansiktsmodell${navn ? ` («${navn}»)` : ''} fra bildene dine. Foer den kan brukes til noe som helst, vil vi at du skal se hva den lager.</p>
        <p>Du faar se tre bilder generert med modellen, i ulike situasjoner. Deretter svarer du ja eller nei.</p>
        <p style="margin:24px 0"><a href="${lenke}" style="background:#C5451B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Se bildene og svar</a></p>
        <p style="color:#6B6358;font-size:14px">Til du svarer, er modellen stengt og kan ikke brukes. Du kan ombestemme deg senere uansett hva du svarer naa.</p>
      </div>`,
    })
    // ⚠️ Tidsstempelet settes FOERST NAAR e-posten faktisk gikk. Sto det ved
    // innsetting, ville purresveipet (092) talt dager fra et varsel som
    // kanskje aldri ble sendt -- og purret paa noe hun ikke har faatt.
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    await db.from('user_characters').update({ approval_sent_at: new Date().toISOString() }).eq('id', karakterId)
  } catch { /* se over */ }
}

// Liste over egne karakterer. «Lazy» status-oppdatering: for rader under trening
// sjekkes fal-køen, og lora_url lagres når treningen er ferdig (~6 min).
export async function GET(request: Request) {
  try {
    // Sikring (2026-07-29): krever innlogging og viser KUN host-tenantens egne
    // karakterer — trente ansikter er rettighetsobjekter, ikke felleseie.
    const { getTenant } = await import('@/lib/tenantServer')
    const tenant = await getTenant()
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ characters: [] }, { status: 401 })
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
    const { data: u } = await anon.auth.getUser(auth.slice(7))
    if (!u?.user?.id) return NextResponse.json({ characters: [] }, { status: 401 })

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: rows, error } = await supabase
      .from('user_characters')
      .select('*')
      .eq('owner_tenant_id', tenant.id)
      .order('created_at', { ascending: false })
    // Defensivt: owner-kolonnen mangler (migrasjon ikke kjørt) → TOM liste, aldri alle
    if (error) return NextResponse.json({ characters: [], migrated: false })

    const falAuth = { Authorization: `Key ${FAL_KEY}` }
    for (const row of rows || []) {
      if (row.status !== 'training' || !row.fal_request_id) continue
      try {
        const st = await fetch(
          `https://queue.fal.run/fal-ai/flux-lora-portrait-trainer/requests/${row.fal_request_id}/status`,
          { headers: falAuth }
        ).then((r) => r.json())
        if (st.status === 'COMPLETED') {
          const result = await fetch(
            `https://queue.fal.run/fal-ai/flux-lora-portrait-trainer/requests/${row.fal_request_id}`,
            { headers: falAuth }
          ).then((r) => r.json())
          const url = result?.diffusers_lora_file?.url
          if (url) {
            await supabase.from('user_characters').update({ lora_url: url, status: 'ready' }).eq('id', row.id)
            row.lora_url = url
            row.status = 'ready'
            // 🔑 HER, OG BARE HER, BLIR MODELLEN NOE Å GODKJENNE (091). Før
            // treningen er ferdig finnes det ingen prøvebilder å vise, og en
            // lenke sendt tidligere ville ført til en tom side.
            //
            // Feiler stille: modellen ER trent og står som pending, altså
            // stengt. Det verste en mislykket e-post kan gjøre er å utsette
            // et ja — ikke å slippe noe gjennom.
            if (row.approval_status === 'pending' && row.subject_email && row.approval_token) {
              varsleOmGodkjenning(row.id, row.subject_email, row.approval_token, row.name).catch(() => {})
            }
          }
        } else if (st.status === 'FAILED' || st.status === 'ERROR') {
          await supabase.from('user_characters').update({ status: 'failed' }).eq('id', row.id)
          row.status = 'failed'
        }
      } catch { /* behold 'training' til neste poll */ }
    }

    // ⚠️ TOKENET UT AV SVARET. `select('*')` tar det med, men det er
    // rettighetshaverens autentisering mot godkjenningssida — ikke noe som
    // skal ligge i adminens nettleser.
    const trygge = (rows || []).map((r) => { const { approval_token, ...resten } = r as Record<string, unknown>; return resten })
    return NextResponse.json({ characters: trygge })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, characters: [] }, { status: 500 })
  }
}

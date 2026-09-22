import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Rettighetshaverens godkjenning av sin egen ansiktsmodell (migrasjon 091).
//
// 🔑 MAN KAN IKKE VISE NOEN EN LoRA-FIL. Man kan bare vise hva den lager.
// Derfor genereres prøvebilder MED modellen, og hen ser seg selv slik den
// gjengir henne før hen svarer. En signatur før man har sett resultatet er en
// signatur på noe ingen visste hvordan så ut.
//
// 🔑 TOKENET ER AUTENTISERINGEN. Hen har ingen konto hos oss og skal ikke
// trenge en for å svare på om ansiktet sitt kan brukes. Samme mønster som
// godkjenningslenkene på stemmesiden. Tokenet er 24 tilfeldige bytes og
// finnes bare på rader som faktisk venter på svar.
//
// ⚠️ Ruta sier ALDRI noe om hvem kunden er eller hva modellen koster. Hen
// svarer på ett spørsmål: ser dette ut som meg, og kan det brukes.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

/** Scenene prøvebildene lages i. Ulike med vilje — én heldig vinkel beviser ingenting. */
const SCENER = [
  'standing in a bright modern office, looking at the camera, neutral expression',
  'outdoors on a city street in daylight, three-quarter view, slight smile',
  'seated indoors with soft window light, close portrait, calm expression',
]

async function hentRad(token: string) {
  const { data } = await admin()
    .from('user_characters')
    .select('id, name, approval_status, subject_email, sample_urls, withdrawn_at, status, sample_pending')
    .eq('approval_token', token)
    .maybeSingle()
  return data as {
    id: string; name: string | null; approval_status: string
    subject_email: string | null; sample_urls: unknown; withdrawn_at: string | null; status: string; sample_pending: unknown
  } | null
}

/** GET ?token= — hva hen skal se. */
export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get('token') || ''
    if (!token) return NextResponse.json({ error: 'Mangler token' }, { status: 400 })
    const rad = await hentRad(token)
    if (!rad) return NextResponse.json({ error: 'Ukjent eller utløpt lenke' }, { status: 404 })
    return NextResponse.json({
      name: rad.name,
      status: rad.approval_status,
      // «trening pågår» er en egen tilstand for hen: modellen finnes ikke ennå,
      // og da kan det heller ikke lages prøvebilder å se på.
      trainingDone: rad.status === 'ready',
      samples: Array.isArray(rad.sample_urls) ? (rad.sample_urls as unknown[]).map(String) : [],
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST — to handlinger:
 *   { token, action: 'sample' }              lag ETT prøvebilde til
 *   { token, action: 'decide', decision }    svar ja eller nei
 *
 * Ett bilde per kall med vilje: hver generering poller fal i inntil 22 sekunder,
 * og tre i samme kall ville sprengt tidsgrensen på en serverless-funksjon. Hen
 * ser dem dukke opp ett for ett i stedet for å vente på alle.
 */
export async function POST(request: Request) {
  try {
    const b = await request.json()
    const token = String(b.token || '')
    if (!token) return NextResponse.json({ error: 'Mangler token' }, { status: 400 })
    const rad = await hentRad(token)
    if (!rad) return NextResponse.json({ error: 'Ukjent eller utløpt lenke' }, { status: 404 })

    if (b.action === 'sample') {
      if (rad.approval_status !== 'pending') {
        return NextResponse.json({ error: 'Modellen venter ikke på svar' }, { status: 409 })
      }
      const alt = Array.isArray(rad.sample_urls) ? (rad.sample_urls as unknown[]).map(String) : []
      if (alt.length >= SCENER.length) return NextResponse.json({ samples: alt })

      // ⚠️ Går bevisst UTENOM godkjenningsporten — se hentAnsiktForProeve.
      // Det er ikke mulig å be noen godkjenne noe de ikke får se.
      //
      // 🔑 TO STEG, IKKE ETT KALL (22.09, migrasjon 103). Før sendte ett kall
      // jobben til fal og ventet inntil 22 sekunder — i en funksjon Netlify
      // kutter på ~26. En kald LoRA tar 20–60 s, så kallet tidsavbrøt, sida sa
      // «kunne ikke lages», og ny last sendte en NY jobb mens den forrige ble
      // ferdig usett. Nå ligger jobben på raden (sample_pending), og sida spør
      // hvert tredje sekund. Og: modellen hentes ÉN gang, her, via omveien —
      // generateFaceImage slo den opp på nytt gjennom den gatede porten, som
      // kaster på pending. Ingen prøvebilde for en ventende modell har derfor
      // noen gang kunnet lages før nå.
      const { hentAnsiktForProeve } = await import('@/lib/faceWithdrawal')
      const { submitFaceImageJob, hentFaceImageResultat } = await import('@/lib/gateway')
      const ch = await hentAnsiktForProeve(rad.id) // kaster om hen alt har sagt nei

      type Ventende = { request_id: string; status_url: string; response_url: string; scene: number; submitted_at: string }
      let ventende = (rad.sample_pending && typeof rad.sample_pending === 'object') ? rad.sample_pending as Ventende : null
      // En jobb som har hengt i over ti minutter regnes som tapt; send en ny.
      if (ventende && Date.now() - new Date(ventende.submitted_at).getTime() > 10 * 60_000) ventende = null

      if (!ventende) {
        const job = await submitFaceImageJob(ch, SCENER[alt.length], '1024x1024')
        ventende = { ...job, scene: alt.length, submitted_at: new Date().toISOString() }
        await admin().from('user_characters').update({ sample_pending: ventende }).eq('id', rad.id)
        return NextResponse.json({ samples: alt, pending: true, status: 'IN_QUEUE' })
      }

      const res = await hentFaceImageResultat(ventende)
      if (res.status === 'FAILED') {
        await admin().from('user_characters').update({ sample_pending: null }).eq('id', rad.id)
        return NextResponse.json({ samples: alt, error: 'fal klarte ikke å lage bildet — prøver igjen' }, { status: 502 })
      }
      if (res.status !== 'COMPLETED') {
        return NextResponse.json({ samples: alt, pending: true, status: res.status })
      }
      const { uploadToR2 } = await import('@/lib/r2Client')
      const url = await uploadToR2({
        fileName: `face-approval/${rad.id}/${Date.now()}.png`,
        fileData: res.png,
        contentType: 'image/png',
      })
      const nye = [...alt, url]
      await admin().from('user_characters').update({ sample_urls: nye, sample_pending: null }).eq('id', rad.id)
      return NextResponse.json({ samples: nye, pending: nye.length < SCENER.length })
    }

    if (b.action === 'decide') {
      const ja = b.decision === 'approved'
      if (!ja && b.decision !== 'rejected') {
        return NextResponse.json({ error: 'Ugyldig svar' }, { status: 400 })
      }
      if (rad.approval_status !== 'pending') {
        // Idempotent: trykker hen to ganger, skal det ikke se ut som en feil.
        return NextResponse.json({ ok: true, status: rad.approval_status })
      }
      await admin().from('user_characters').update({
        approval_status: ja ? 'approved' : 'rejected',
        approved_at: ja ? new Date().toISOString() : null,
        // Et nei er en tilbaketrekking fra første stund. Da trenger ingen
        // annen kode å kjenne til godkjenningen for å respektere svaret.
        withdrawn_at: ja ? null : new Date().toISOString(),
        // Tokenet brennes: lenken skal ikke kunne brukes om igjen av noen som
        // får tak i e-posten senere.
        approval_token: null,
      }).eq('id', rad.id)
      return NextResponse.json({ ok: true, status: ja ? 'approved' : 'rejected' })
    }

    return NextResponse.json({ error: 'Ukjent handling' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

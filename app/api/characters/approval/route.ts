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

// Scener, lagring, signering og batch-logikk bor i lib/faceSamples (105) —
// delt med cron-jobben, som naa lager bildene foer e-posten gaar.
import { SCENER, signerProever, startProever, hentFerdigeProever, lesBatch } from '@/lib/faceSamples'

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
      samples: await signerProever(rad.sample_urls),
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
// 🔑 PROEVEBILDENE LIGGER PRIVAT OG SIGNERES VED LESING (22.09). Foer gikk de
// til uploadToR2 — som viste seg aa vaere en STUB («Upload placeholder»):
// den lastet aldri opp noe og returnerte en oppdiktet adresse. Tre bilder ble
// generert, betalt og kastet, og Lars saa tre brukne ikoner. Og R2-boetta
// er offentlig; et generert bilde av et ekte ansikt hoerer ikke der (094).
// Naa: privat Supabase-boette, STIEN paa raden, signert lenke i ti minutter
// naar sida spoer (signerProever i lib/faceSamples).

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
      if (alt.length >= SCENER.length) return NextResponse.json({ samples: await signerProever(alt), pending: false, v: 2 })

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
      const ch = await hentAnsiktForProeve(rad.id) // kaster om hen alt har sagt nei

      // Batchen (105): alle manglende scener sendes paa én gang, og hvert kall
      // herfra henter det som er ferdig. Som regel har cron-jobben alt laget
      // bildene foer hun kom hit; da er dette bare en lesing.
      let batch = lesBatch(rad.sample_pending)
      // En batch som har hengt i over ti minutter regnes som tapt; send paa nytt.
      if (batch && Date.now() - new Date(batch.submitted_at).getTime() > 10 * 60_000) {
        await admin().from('user_characters').update({ sample_pending: null }).eq('id', rad.id)
        batch = null
      }
      if (!batch) {
        await startProever(ch, rad.id, alt.length)
        return NextResponse.json({ samples: await signerProever(alt), pending: true, status: 'IN_QUEUE', v: 3 })
      }
      const { stier, pending } = await hentFerdigeProever(rad.id, alt, batch)
      if (!pending && stier.length < SCENER.length) {
        // Noen scener feilet hos fal — send dem paa nytt.
        await startProever(ch, rad.id, stier.length)
        return NextResponse.json({ samples: await signerProever(stier), pending: true, status: 'IN_QUEUE', v: 3 })
      }
      return NextResponse.json({ samples: await signerProever(stier), pending, v: 3 })
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

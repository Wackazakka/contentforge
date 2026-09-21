import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

const FAL_KEY = process.env.CONTENTFORGE_FAL_KEY

/**
 * Trenerne vi kan bruke, og hva de koster (migrasjon 093).
 *
 * 🔑 VALGET ER ADMIN-STYRT, ALDRI KUNDENS. «Vil du ha Flux 1 portrett eller
 * Flux 2 dev?» er ikke et spørsmål en produsent kan svare på, og et galt valg
 * gir dårligere likhet hen får skylden for selv. Kvaliteten på modellen er en
 * egenskap ved RETTIGHETSHAVEREN — samme logikk som PVC mot en bibliotekstemme.
 *
 * ⚠️ PRISFORSKJELLEN ER FEM GANGER, og den er ikke bevist verdt det. Flux 1-
 * treneren er portrett-SPESIALISERT; Flux 2-treneren er generell med
 * karakterer som ett av flere bruksområder. Sammenlikningen er altså ikke
 * «gammel mot ny», og den må måles før den brukes som standard.
 */
const TRENERE = {
  portrait: {
    endepunkt: 'fal-ai/flux-lora-portrait-trainer',
    steps: 1500,
    // ~$2 per kjoering, uavhengig av steg.
    raakostNok: 20,
  },
  flux2: {
    endepunkt: 'fal-ai/flux-2-trainer',
    steps: 1500,
    // $0,0064 per steg x 1500 = $9,60. USD->NOK ~10.
    raakostNok: 96,
  },
} as const
type TrenerId = keyof typeof TRENERE
const STANDARD_TRENER: TrenerId = 'portrait'

// Start trening av egen karakter: zip med bilder (R2-URL) → fal flux-lora-portrait-trainer
// (samme trener som Lawrence — bevist god ansiktslikhet). Steps/lr fra den beviste kjøringen.
export async function POST(request: Request) {
  try {
    const { name, zipPath, consentSubject, subjectEmail: raaEpost, trainer: raaTrener } = await request.json()
    if (!name?.trim() || !zipPath) {
      return NextResponse.json({ error: 'Mangler navn eller zipPath' }, { status: 400 })
    }

    // 🔑 SAMTYKKEPORTEN (089). Skjemaet hadde lenge en avkryssing med riktig
    // tekst, men den ble aldri sendt hit — kallet var {name, zipUrl}. Boksen
    // gatet en knapp i nettleseren og forsvant, så «samtykket denne personen?»
    // hadde ingen kilde. ElevenLabs gater proff-kloning med en innspilt
    // erklæring; også selverklært, men LAGRET. Det er forskjellen vi kopierer.
    //
    // Tre svar, ikke ja/nei: begrunnelsene har ulik risiko, og en boolean ville
    // slått dem sammen og gjort loggen ubrukelig.
    //
    // ⚠️ AVVISES HER, IKKE BARE I SKJEMAET. Ruta er et offentlig endepunkt —
    // en klient som ikke sender feltet skal ikke få trent, uansett hvilket
    // grensesnitt den kom fra.
    //
    // Porten står FØR innloggingssjekken, og det er med vilje: da kan den
    // etterprøves utenfra uten en gyldig konto, og «virker samtykkeporten?»
    // blir et spørsmål man kan besvare i stedet for å stole på. Ingenting
    // lekker — at feltet kreves står allerede i klientbunten. Flyttes den
    // under auth, mister den den egenskapen.
    // 🔑 GJELDER DET EN ANNEN PERSON, MÅ VI VITE HVEM (091). Uten adressen
    // kan hen ikke få se modellen av seg selv, og godkjenningen blir en
    // formalitet vi krysser av på hennes vegne — akkurat det 089 skulle
    // slutte med. Samme krav som stemmesiden har hatt hele tiden: en
    // rettighetshaver uten e-post kan ikke varsles om noe som helst.
    const subjectEmail = String(raaEpost || '').trim()
    if (consentSubject === 'other_consented' && !subjectEmail.includes('@')) {
      return NextResponse.json({
        error: 'Gjelder det en annen person, må vi ha e-posten hennes — hun skal godkjenne modellen før den kan brukes.',
        code: 'SUBJECT_EMAIL_REQUIRED',
      }, { status: 400 })
    }

    const LOVLIGE = ['self', 'other_consented', 'not_a_person'] as const
    if (!LOVLIGE.includes(consentSubject)) {
      return NextResponse.json({
        error: 'Treningen krever en erklæring om hvem bildene viser, og at personen har samtykket.',
        code: 'CONSENT_REQUIRED',
      }, { status: 400 })
    }
    // Sikring (2026-07-29): kun innloggede kan trene, og karakteren eies av host-tenanten
    const { getTenant } = await import('@/lib/tenantServer')
    const tenant = await getTenant()
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
    const { data: u } = await anon.auth.getUser(auth.slice(7))
    if (!u?.user?.id) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    if (!FAL_KEY) return NextResponse.json({ error: 'CONTENTFORGE_FAL_KEY mangler' }, { status: 500 })

    // ⚠️ TRENERVALG KREVER ADMIN. Ruta er et offentlig endepunkt; uten denne
    // sjekken kunne hvilken som helst innlogget kunde valgt den fem ganger
    // dyrere treneren — paa vaar fal-noekkel.
    let trener: TrenerId = STANDARD_TRENER
    if (raaTrener && raaTrener !== STANDARD_TRENER) {
      const { isTenantAdmin } = await import('@/lib/voiceBank')
      if (!(raaTrener in TRENERE)) {
        return NextResponse.json({ error: 'Ukjent trener' }, { status: 400 })
      }
      if (!u.user.email || !(await isTenantAdmin(u.user.email, tenant.id))) {
        return NextResponse.json({ error: 'Bare admin kan velge trener' }, { status: 403 })
      }
      trener = raaTrener as TrenerId
    }
    const valgt = TRENERE[trener]

    // Unikt trigger-ord, f.eks. CHRXKQZW
    const trigger = 'CHR' + Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('')

    // 🔑 SIGNERT LENKE MED KORT LEVETID, IKKE EN OFFENTLIG URL. Fal må kunne
    // hente zipen, men bare mens treningen startes. Én time er rikelig og
    // etterlater ingen permanent leselenke til bildene av et menneske.
    const { BOTTE } = await import('@/app/api/characters/upload-url/route')
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: sign, error: signErr } = await supabase
      .storage.from(BOTTE).createSignedUrl(String(zipPath), 3600)
    if (signErr || !sign?.signedUrl) {
      return NextResponse.json({ error: `Fant ikke treningsbildene (${signErr?.message || 'ukjent sti'})` }, { status: 400 })
    }

    const submitRes = await fetch(`https://queue.fal.run/${valgt.endepunkt}`, {
      method: 'POST',
      headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images_data_url: sign.signedUrl,
        trigger_phrase: trigger,
        steps: valgt.steps,
        learning_rate: 0.0002,
      }),
    })
    const submit = await submitRes.json().catch(() => ({}))
    if (!submitRes.ok || !submit.request_id) {
      return NextResponse.json({ error: 'fal-trening feilet: ' + JSON.stringify(submit).slice(0, 200) }, { status: 502 })
    }

    const { data, error } = await supabase
      .from('user_characters')
      .insert({
        name: name.trim(),
        trigger_word: trigger,
        status: 'training',
        fal_request_id: submit.request_id,
        // Eierskap: host-tenanten (uuid-guard — dev-fallback har id 'root').
        // Pre-migrasjon feiler insert på ukjente kolonner; bedre enn eierløse rader.
        ...(/^[0-9a-f-]{36}$/i.test(tenant.id) ? { owner_tenant_id: tenant.id } : {}),
        created_by: u.user.id,
        // Erklæringen lagres på raden, ikke i en logg ved siden av: spørsmålet
        // «hvem gikk god for dette ansiktet?» skal besvares der ansiktet er.
        // Maaleinstrumentet (093): uten dette kan to modeller se ulike ut
        // uten at noen kan si hvorfor.
        trainer: valgt.endepunkt,
        // 🔑 GRUNNLAGET (094). Uten denne finnes modellen, men ikke bildene
        // den ble laget fra: ingen retrening, ingen revisjon, og «slett
        // grunnlaget» blir noe vi ikke kan utføre. En av-bryter på modellen
        // mens kildebildene ligger et sted ingen vet, er en halv rettighet.
        // ⚠️ STIEN, IKKE DEN SIGNERTE LENKEN. En signert URL utløper, og en
        // rad som peker på noe utløpt svarer ikke på «hvilke bilder ble
        // modellen laget fra?». Adminen signerer på nytt ved behov.
        training_set_url: String(zipPath),
        consent_subject: consentSubject,
        consent_declared_at: new Date().toISOString(),
        consent_declared_by: u.user.id,
        // Godkjenningen (091). Gjelder det en annen person, er modellen
        // STENGT til hen har sett proevebildene og sagt ja. Er det deg selv
        // eller ingen virkelig person, finnes det ingen tredjepart aa spoerre.
        approval_status: consentSubject === 'other_consented' ? 'pending' : 'not_required',
        subject_email: consentSubject === 'other_consented' ? subjectEmail : null,
        // Tokenet lages HER, ikke naar e-posten sendes: da finnes lenken saa
        // snart raden finnes, og en e-post som feiler kan sendes paa nytt uten
        // at noen maa gjenskape en hemmelighet som ble borte.
        approval_token: consentSubject === 'other_consented'
          ? randomBytes(24).toString('base64url')
          : null,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: 'DB-feil: ' + error.message }, { status: 500 })

    // Maaling: treningen kjoerer paa VAAR fal-noekkel (~20 kr raakost) og var
    // UMAALT — gratis GPU per klikk, usynlig i alle regnskap. Foeres naa som
    // usage_event paa brukerens organisasjon (karakterer har ikke produkt).
    // awaites; feiler stille inne i logUsageEvent og velter aldri treningen.
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', u.user.id)
        .eq('tenant_id', tenant.id)
        .maybeSingle()
      const { logUsageEvent } = await import('@/lib/tenantBilling')
      const { COSTS_NOK } = await import('@/lib/costs')
      await logUsageEvent({
        organizationId: org?.id ?? null,
        userId: u.user.id,
        eventType: 'character_training',
        // ⚠️ Raakost per trener, ikke en fast sats. Flux 2 koster fem ganger
        // saa mye, og en maaling som foerer feil tall er ingen maaling.
        costNok: valgt.raakostNok,
        meta: { characterId: data.id, name: name.trim(), trainer: valgt.endepunkt },
      })
    } catch { /* maaling velter aldri trening */ }

    return NextResponse.json({ ok: true, character: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

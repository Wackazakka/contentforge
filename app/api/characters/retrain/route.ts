import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import { TRENERE, type TrenerId } from '@/app/api/characters/train/route'

// Tren en modell på nytt fra settet den ble laget fra (094).
//
// 🔑 HVORFOR DENNE FINNES. `training_set_url` skulle gjøre retrening mulig,
// men det fantes ingen vei til å faktisk gjøre det: karaktersida tar imot
// enkeltbilder og pakker dem selv, så en retrening krevde å laste ned zipen,
// pakke den ut og velge 18 filer på nytt. Kolonnen svarte på HVOR bildene er,
// ikke «tren denne på nytt».
//
// 🔑 NY RAD, ALDRI OVERSKRIVING. To grunner, og den andre er den alvorlige:
//   1. En sammenlikning trenger begge modellene samtidig.
//   2. Å overskrive ville drept en modell rettighetshaveren HAR godkjent.
//      Den gamle skal fortsette å virke mens den nye vurderes.
//
// 🔑 GODKJENNINGEN ARVES IKKE. Hun godkjente den modellen, ikke denne — og
// hele poenget med 091 er at man godkjenner det modellen LAGER. En annen
// trener lager noe annet. Gjelder det en ekte person, starter den nye raden
// derfor på `pending`, og hun får spørsmålet på nytt.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

export async function POST(request: Request) {
  try {
    const FAL_KEY = process.env.CONTENTFORGE_FAL_KEY
    if (!FAL_KEY) return NextResponse.json({ error: 'CONTENTFORGE_FAL_KEY mangler' }, { status: 500 })

    const tenant = await getTenant()
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    const { data: u } = await admin().auth.getUser(auth.slice(7))
    const epost = u?.user?.email
    if (!u?.user?.id || !epost) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
    // Retrening bruker vår fal-nøkkel og kan koste 96 kr. Admin, ikke kunde.
    if (!(await isTenantAdmin(epost, tenant.id))) {
      return NextResponse.json({ error: 'Bare admin kan trene på nytt' }, { status: 403 })
    }

    const { characterId, trainer: raaTrener } = await request.json()
    if (!characterId) return NextResponse.json({ error: 'Mangler characterId' }, { status: 400 })
    if (!(raaTrener in TRENERE)) return NextResponse.json({ error: 'Ukjent trener' }, { status: 400 })
    const valgt = TRENERE[raaTrener as TrenerId]

    const db = admin()
    const { data: kilde } = await db
      .from('user_characters')
      .select('id, name, owner_tenant_id, training_set_url, consent_subject, subject_email')
      .eq('id', characterId)
      .maybeSingle()
    const k = kilde as {
      id: string; name: string | null; owner_tenant_id: string | null
      training_set_url: string | null; consent_subject: string | null; subject_email: string | null
    } | null
    if (!k) return NextResponse.json({ error: 'Fant ikke modellen' }, { status: 404 })
    if (!k.training_set_url) {
      return NextResponse.json({
        error: 'Denne modellen har ingen sporede treningsbilder, så den kan ikke trenes på nytt.',
        code: 'NO_TRAINING_SET',
      }, { status: 409 })
    }

    // Legacy-settene ligger på en offentlig R2-URL og brukes som de er. Nye
    // ligger privat og må signeres — fal må kunne hente, men bare nå.
    let bilderUrl: string
    if (k.training_set_url.startsWith('http')) {
      bilderUrl = k.training_set_url
    } else {
      const { BOTTE } = await import('@/app/api/characters/upload-url/route')
      const { data: sign, error: signErr } = await db.storage.from(BOTTE).createSignedUrl(k.training_set_url, 3600)
      if (signErr || !sign?.signedUrl) {
        return NextResponse.json({ error: `Fant ikke treningsbildene (${signErr?.message || 'ukjent sti'})` }, { status: 400 })
      }
      bilderUrl = sign.signedUrl
    }

    const trigger = 'CHR' + Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('')
    const submitRes = await fetch(`https://queue.fal.run/${valgt.endepunkt}`, {
      method: 'POST',
      headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
      // Kroppen er trenerens egen — de to endepunktene tar ulike felt (se TRENERE).
      body: JSON.stringify(valgt.kropp(bilderUrl, trigger)),
    })
    const submit = await submitRes.json().catch(() => ({}))
    if (!submitRes.ok || !submit.request_id) {
      return NextResponse.json({ error: 'fal-trening feilet: ' + JSON.stringify(submit).slice(0, 200) }, { status: 502 })
    }

    // ⚠️ `pending` hvis det gjelder en ekte person — se toppen. Hun godkjente
    // den forrige modellen, ikke denne.
    const maaGodkjennes = k.consent_subject === 'other_consented'
    const merke = valgt.endepunkt.includes('flux-2') ? 'Flux 2' : 'Flux 1'

    const { data, error } = await db.from('user_characters').insert({
      name: `${k.name || 'Ansikt'} (${merke})`,
      trigger_word: trigger,
      status: 'training',
      fal_request_id: submit.request_id,
      owner_tenant_id: k.owner_tenant_id,
      created_by: u.user.id,
      trainer: valgt.endepunkt,
      training_set_url: k.training_set_url,
      // Erklæringen gjelder BILDENE, og det er samme sett. Den arves derfor —
      // men godkjenningen av resultatet gjør det ikke.
      consent_subject: k.consent_subject,
      consent_declared_at: new Date().toISOString(),
      consent_declared_by: u.user.id,
      subject_email: k.subject_email,
      approval_status: maaGodkjennes ? 'pending' : 'not_required',
      approval_token: maaGodkjennes ? randomBytes(24).toString('base64url') : null,
    }).select('id, name').single()
    if (error) return NextResponse.json({ error: 'DB-feil: ' + error.message }, { status: 500 })

    try {
      const { logUsageEvent } = await import('@/lib/tenantBilling')
      await logUsageEvent({
        organizationId: null,
        userId: u.user.id,
        eventType: 'character_training',
        costNok: valgt.raakostNok,
        meta: { characterId: data!.id, name: data!.name, trainer: valgt.endepunkt, retrainOf: k.id },
      })
    } catch { /* maaling velter aldri trening */ }

    return NextResponse.json({ ok: true, character: data, trainer: valgt.endepunkt, kostNok: valgt.raakostNok })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

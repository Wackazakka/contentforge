import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'
import { fremdrift, type Register } from '@/lib/stemmeopptak'

// Adminsiden av opptaksløypa: be en rettighetshaver lese inn stemmen sin.
//
// 🔑 EGEN RUTE FORDI AUTENTISERINGEN ER EN ANNEN. /api/stemmeopptak kjenner
// henne på tokenet i lenken — hun har ingen konto. Her er det en admin som
// spør, og de to må ikke kunne forveksles: et token som ga adminrettigheter,
// eller en admin som kunne lagre klipp på hennes vegne, ville begge vært feil.
//
// 🔑 ÉN ÅPEN ØKT PER SKUESPILLER. Sendes lenken to ganger, skal hun ikke få
// to løyper som hver teller sin halvdel. Den eksisterende returneres i
// stedet, slik at «send på nytt» faktisk betyr det.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

async function vakt(request: Request) {
  const tenant = await getTenant()
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return { fail: NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 }) }
  const { data } = await admin().auth.getUser(auth.slice(7))
  const epost = data?.user?.email
  if (!epost || !(await isTenantAdmin(epost, tenant.id))) {
    return { fail: NextResponse.json({ error: 'Ingen admin-tilgang' }, { status: 403 }) }
  }
  return { tenant }
}

async function dekningFor(sessionId: string) {
  const { data } = await admin()
    .from('voice_recording_clips').select('register, seconds')
    .eq('session_id', sessionId).eq('discarded', false)
  const per = new Map<string, number>()
  for (const r of (data || []) as Array<{ register: string; seconds: number }>) {
    per.set(r.register, (per.get(r.register) || 0) + Number(r.seconds))
  }
  return fremdrift([...per.entries()].map(([register, sek]) => ({ register: register as Register, sek })))
}

/** GET ?actorId= — finnes det en økt, og hvor langt er hun? */
export async function GET(request: Request) {
  const v = await vakt(request)
  if (v.fail) return v.fail
  const actorId = new URL(request.url).searchParams.get('actorId') || ''
  if (!actorId) return NextResponse.json({ error: 'Mangler actorId' }, { status: 400 })

  const { data } = await admin()
    .from('voice_recording_sessions')
    .select('id, token, status, subject_email, created_at, completed_at')
    .eq('actor_id', actorId)
    .order('created_at', { ascending: false })
    .limit(1)
  const oekt = (data || [])[0] as { id: string; token: string; status: string; subject_email: string | null; created_at: string; completed_at: string | null } | undefined
  if (!oekt) return NextResponse.json({ oekt: null })

  return NextResponse.json({
    oekt: {
      id: oekt.id, status: oekt.status, epost: oekt.subject_email,
      opprettet: oekt.created_at, fullfoert: oekt.completed_at,
      // Lenken vises for adminen, som kan sende den manuelt om e-post svikter.
      lenke: `/opptak/${oekt.token}`,
    },
    fremdrift: await dekningFor(oekt.id),
  })
}

/** POST { actorId } — opprett økt og send lenken. */
export async function POST(request: Request) {
  const v = await vakt(request)
  if (v.fail) return v.fail
  const tenant = v.tenant!
  try {
    const { actorId } = await request.json()
    if (!actorId) return NextResponse.json({ error: 'Mangler actorId' }, { status: 400 })

    const { data: a } = await admin()
      .from('voice_actors').select('id, name, actor_email').eq('id', actorId).maybeSingle()
    const actor = a as { id: string; name: string; actor_email: string | null } | null
    if (!actor) return NextResponse.json({ error: 'Fant ikke rettighetshaveren' }, { status: 404 })
    if (!actor.actor_email) {
      // ⚠️ Uten e-post kan hun ikke få lenken, og en økt ingen kan åpne er
      // bare en rad. Vi sier hva som mangler framfor å lage den likevel.
      return NextResponse.json({
        error: `${actor.name} har ingen e-postadresse på raden sin. Legg den inn under «Takster» først.`,
        code: 'MANGLER_EPOST',
      }, { status: 400 })
    }

    // Finnes en åpen økt, returneres den — «send på nytt» skal ikke splitte
    // fremdriften i to løyper.
    const { data: finnes } = await admin()
      .from('voice_recording_sessions')
      .select('id, token').eq('actor_id', actorId).eq('status', 'open').maybeSingle()
    const oekt = (finnes as { id: string; token: string } | null) ?? await (async () => {
      const token = randomBytes(24).toString('base64url')
      const { data, error } = await admin().from('voice_recording_sessions').insert({
        actor_id: actorId,
        tenant_id: tenant.id !== 'root' ? tenant.id : null,
        token,
        subject_email: actor.actor_email,
      }).select('id, token').single()
      if (error) throw new Error(error.message)
      return data as { id: string; token: string }
    })()

    const vert = tenant.custom_domain ? `https://${tenant.custom_domain}` : `https://${tenant.slug}.norditech.io`
    const lenke = `${vert}/opptak/${oekt.token}`
    const merke = tenant.app_name || 'TwinLedger'

    // Feiler stille: økta finnes, og lenken vises i adminen slik at den kan
    // sendes for hånd. En mislykket e-post skal ikke velte opprettelsen.
    let epostSendt = false
    try {
      if (process.env.RESEND_API_KEY) {
        const { Resend } = await import('resend')
        await new Resend(process.env.RESEND_API_KEY).emails.send({
          from: `${merke} <hello@centerforge.app>`,
          to: actor.actor_email,
          subject: 'Les inn stemmen din',
          html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1A16">
            <h2 style="margin:0 0 12px">Hei ${actor.name.split(' ')[0]},</h2>
            <p>For å lage en stemmemodell av deg trenger vi omtrent <strong>30 minutter opptak</strong>. Du gjør det selv, hjemmefra, og du kan ta pauser — vi husker hvor langt du er kommet.</p>
            <p>Du får tekster å lese høyt, én om gangen, med en instruksjon over hver: rolig, varmt, strengt, hviskende. Variasjonen er poenget — den gir modellen rekkevidde.</p>
            <p style="margin:24px 0"><a href="${lenke}" style="background:#C5451B;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Start opptaket</a></p>
            <p style="color:#6B6358;font-size:14px">Bruk samme mikrofon og samme rom hele veien. Det betyr mer for resultatet enn hvor godt utstyret er. Et vanlig headset i et stille rom holder fint.</p>
          </div>`,
        })
        epostSendt = true
      }
    } catch { /* se over */ }

    return NextResponse.json({ ok: true, lenke, epostSendt, epost: actor.actor_email })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

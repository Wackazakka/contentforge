import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { isTenantAdmin } from '@/lib/voiceBank'

// Se — eller slette — bildene en ansiktsmodell ble trent fra (094).
//
// 🔑 BØTTA ER PRIVAT, SÅ DET FINNES INGEN LENKE Å KLIKKE PÅ. Den må lages i
// det øyeblikket noen spør, og den utløper. Det er hele poenget: 18 bilder av
// et menneske skal ikke ligge på en permanent adresse.
//
// 🔑 DELETE GJØR «SLETT GRUNNLAGET» TIL NOE VI FAKTISK KAN UTFØRE. En
// av-bryter på modellen (088) mens kildebildene ligger igjen, er en halv
// rettighet. Sletting er endelig og fjerner muligheten til å trene på nytt —
// derfor er den admin-styrt, og derfor sier svaret det rett ut.

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
  return { ok: true as const }
}

async function hentSti(characterId: string): Promise<string | null> {
  const { data } = await admin()
    .from('user_characters').select('training_set_url').eq('id', characterId).maybeSingle()
  return (data as { training_set_url?: string | null } | null)?.training_set_url ?? null
}

/** GET ?characterId= — en signert lenke som varer i ti minutter. */
export async function GET(request: Request) {
  const v = await vakt(request)
  if (v.fail) return v.fail
  const id = new URL(request.url).searchParams.get('characterId') || ''
  const sti = id ? await hentSti(id) : null
  if (!sti) return NextResponse.json({ error: 'Ingen treningsbilder sporet på denne modellen' }, { status: 404 })

  // ⚠️ Rader fra før 094 peker på en offentlig R2-URL. De er allerede åpne —
  // det er ikke noe å signere, og å late som ville skjult at de ligger slik.
  if (sti.startsWith('http')) {
    return NextResponse.json({ url: sti, legacy: true })
  }

  const { BOTTE } = await import('@/app/api/characters/upload-url/route')
  const { data, error } = await admin().storage.from(BOTTE).createSignedUrl(sti, 600)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message || 'Kunne ikke lage lenke' }, { status: 500 })
  }
  return NextResponse.json({ url: data.signedUrl, legacy: false })
}

/** DELETE — fjern grunnlaget for godt. */
export async function DELETE(request: Request) {
  const v = await vakt(request)
  if (v.fail) return v.fail
  const { characterId } = await request.json().catch(() => ({ characterId: '' }))
  const sti = characterId ? await hentSti(String(characterId)) : null
  if (!sti) return NextResponse.json({ error: 'Ingen treningsbilder sporet' }, { status: 404 })
  if (sti.startsWith('http')) {
    // Legacy i den offentlige R2-bøtta. Sletting der er en annen operasjon,
    // og å svare «slettet» uten å ha gjort det ville vært det verste av alt.
    return NextResponse.json({
      error: 'Dette settet ligger i den gamle offentlige lagringen og må fjernes derfra manuelt.',
      code: 'LEGACY_STORAGE', path: sti,
    }, { status: 409 })
  }

  const { BOTTE } = await import('@/app/api/characters/upload-url/route')
  const { error } = await admin().storage.from(BOTTE).remove([sti])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Raden beholder IKKE en peker til noe som ikke finnes.
  await admin().from('user_characters').update({ training_set_url: null }).eq('id', characterId)
  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fullfoerTreninger } from '@/lib/faceTraining'


// Fullfoering og godkjenningsvarsel bor i lib/faceTraining (22.09) — delt med
// cron-jobben som kjoerer hvert tiende minutt. Denne sidevisningen er ikke
// lenger det eneste stedet en trening blir ferdig.
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

    // Fullfoer ferdige treninger for denne tenanten, og hent lista paa nytt
    // saa svaret viser det som nettopp ble flippet.
    const { ferdige, feilet } = await fullfoerTreninger({ tenantId: tenant.id })
    let rader = rows || []
    if (ferdige || feilet) {
      const { data: igjen } = await supabase.from('user_characters').select('*').eq('owner_tenant_id', tenant.id).order('created_at', { ascending: false })
      rader = igjen || rader
    }

    // ⚠️ TOKENET UT AV SVARET. `select('*')` tar det med, men det er
    // rettighetshaverens autentisering mot godkjenningssida — ikke noe som
    // skal ligge i adminens nettleser.
    const trygge = rader.map((r) => { const { approval_token, ...resten } = r as Record<string, unknown>; return resten })

    // Proevebildene hun godkjente (091/103) — modellens kontaktkopi. Lars
    // spurte 22.09 «hvor er de naa?»: de laa i den private boetta med sti paa
    // raden, og var ikke synlige noe sted etter svaret. Signeres 10 min her;
    // eldre rader med offentlige R2-adresser (doede) hoppes over.
    const { BOTTE } = await import('@/app/api/characters/upload-url/route')
    const medProever = await Promise.all(trygge.map(async (r) => {
      const stier = (Array.isArray(r.sample_urls) ? r.sample_urls : []).filter((s): s is string => typeof s === 'string' && !s.startsWith('http'))
      if (stier.length === 0) return { ...r, samples: [] as string[] }
      const { data: signert } = await supabase.storage.from(BOTTE).createSignedUrls(stier, 600)
      return { ...r, samples: (signert || []).map((x) => x.signedUrl).filter(Boolean) }
    }))
    return NextResponse.json({ characters: medProever })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, characters: [] }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fullfoerTreninger } from '@/lib/faceTraining'


// Fullfoering og godkjenningsvarsel bor i lib/faceTraining (22.09) — delt med
// cron-jobben som kjoerer hvert tiende minutt. Denne sidevisningen er ikke
// lenger det eneste stedet en trening blir ferdig.
// Liste over egne karakterer. «Lazy» status-oppdatering: for rader under trening
// sjekkes fal-køen, og lora_url lagres når treningen er ferdig (~6 min) — paa
// raden, aldri i svaret.
export async function GET(request: Request) {
  try {
    // Sikring (2026-07-29): krever innlogging og viser KUN host-tenantens egne
    // karakterer — trente ansikter er rettighetsobjekter, ikke felleseie.
    // Innenfor tenanten avgjoer rollen (25.10, se under).
    const { getTenant } = await import('@/lib/tenantServer')
    const tenant = await getTenant()
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ characters: [] }, { status: 401 })
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
    const { data: u } = await anon.auth.getUser(auth.slice(7))
    if (!u?.user?.id) return NextResponse.json({ characters: [] }, { status: 401 })

    // Innebygde personer (Adam/Lawrence) denne brukeren får tilbud om — tenant-
    // OG brukersperre avgjøres her, ikke i nedtrekkslistene (Lars 12/10)
    const { builtinCharactersFor } = await import('@/lib/characters')
    const builtin = builtinCharactersFor({ tenantSlug: tenant.slug, userId: u.user.id }).map((c) => ({ id: c.id, name: c.name }))

    // 🔑 HVEM SER HVA (25.10.2026). Lista var hele tenantens rader, raa, til
    // alle innloggede — og paa twinledger.ai kan hvem som helst registrere seg.
    // Med raden fulgte lora_url: en offentlig, evig fal-adresse til selve
    // modellfila. Da var «kunden faar aldri fila» og «modellen kan stenges»
    // to loefter enhver registrert bruker kunne bryte.
    // Admin (samme regel som /api/voice-bank/admin) ser hele tenanten. Alle
    // andre ser det de selv har laget. Bankansiktene de faar produsere med,
    // kommer fra /api/face-actors — der med pris og stengte filtrert bort.
    const { isTenantAdmin } = await import('@/lib/voiceBank')
    const erAdmin = await isTenantAdmin(u.user.email, tenant.id)
    const userId = u.user.id

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    // ⚠️ FELTLISTE, IKKE `*`. lora_url, training_set_url, fal_request_id,
    // approval_token, source_files, trigger_word og subject_email skal aldri
    // til nettleseren — genereringen slaar opp LoRA-en selv (lib/loraKilde).
    // En ny kolonne blir dermed ikke med i svaret uten at noen velger den.
    const hent = () => {
      const q = supabase
        .from('user_characters')
        .select('id, name, status, created_at, created_by, last_error, trainer, approval_status, approval_sent_at, withdrawn_at, training_set_url, sample_urls, sample_scores')
        .eq('owner_tenant_id', tenant.id)
      return (erAdmin ? q : q.eq('created_by', userId)).order('created_at', { ascending: false })
    }
    const { data: rows, error } = await hent()
    // Defensivt: owner-kolonnen mangler (migrasjon ikke kjørt) → TOM liste, aldri alle
    if (error) return NextResponse.json({ characters: [], builtin, migrated: false })

    // Fullfoer ferdige treninger for denne tenanten, og hent lista paa nytt
    // saa svaret viser det som nettopp ble flippet.
    const { ferdige, feilet } = await fullfoerTreninger({ tenantId: tenant.id })
    let rader = rows || []
    if (ferdige || feilet) {
      const { data: igjen } = await hent()
      rader = igjen || rader
    }

    // Proevebildene hun godkjente (091/103) — modellens kontaktkopi. Lars
    // spurte 22.09 «hvor er de naa?»: de laa i den private boetta med sti paa
    // raden, og var ikke synlige noe sted etter svaret. Signeres 10 min her;
    // eldre rader med offentlige R2-adresser (doede) hoppes over.
    // Bildene og likhetstallene er et ansikt: bare admin og den som laget
    // modellen faar dem — ogsaa om lista en dag viser flere rader enn egne.
    const { BOTTE } = await import('@/app/api/characters/upload-url/route')
    const characters = await Promise.all(rader.map(async (r) => {
      const ut = {
        id: r.id,
        name: r.name,
        status: r.status,
        created_at: r.created_at,
        last_error: r.last_error,
        trainer: r.trainer,
        // Merket i «Medvirkende» (lib/modellMerke) og statuslinja paa
        // skuespillersiden leser disse tre. Ingen av dem avsloerer en fil.
        approval_status: r.approval_status,
        approval_sent_at: r.approval_sent_at,
        withdrawn_at: r.withdrawn_at,
        // Bare OM settet finnes — «Tren paa nytt» trenger ikke adressen.
        has_training_set: !!r.training_set_url,
        sample_scores: null as unknown,
        samples: [] as string[],
      }
      if (!erAdmin && r.created_by !== userId) return ut
      ut.sample_scores = r.sample_scores ?? null
      const stier = (Array.isArray(r.sample_urls) ? r.sample_urls : []).filter((s): s is string => typeof s === 'string' && !s.startsWith('http'))
      if (stier.length === 0) return ut
      const { data: signert } = await supabase.storage.from(BOTTE).createSignedUrls(stier, 600)
      ut.samples = (signert || []).map((x) => x.signedUrl).filter((s): s is string => !!s)
      return ut
    }))
    return NextResponse.json({ characters, builtin })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, characters: [] }, { status: 500 })
  }
}

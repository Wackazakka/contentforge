import { NextResponse } from 'next/server'
import { likeSafe } from '@/lib/epost'
import { createClient } from '@supabase/supabase-js'
import { getTenant } from '@/lib/tenantServer'
import { actorSettlement } from '@/lib/actorLedger'
import { PREVIEW_ROYALTY_PER_1000 } from '@/lib/voiceBank'
import { lesBekreftelse } from '@/lib/identitet'
import { utleggFor, avgiftFor } from '@/lib/onboardingServer'
import { radFelter, lesArtistType } from '@/lib/sang'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// Rettighetshaverens eget innsyn i hovedboken.
//
// Dette er den halvdelen som manglet. Forsiden lover «et menneske kan si ja
// uten å måtte stole på noen» — det krever at mennesket selv kan se hva
// stemmen er brukt til, hva det ga, og hva som er betalt. Uten denne ruten
// måtte de spørre oss og stole på tallet.
//
// Identitet: den innloggede brukerens e-post (fra verifisert JWT, aldri fra
// body/query) matches mot voice_actors.actor_email — det eneste
// identitetsfeltet en rettighetshaver har i systemet. Én person kan ha flere
// rader (én per forvaltningsavtale: stemme, ansikt, eller begge).
//
// Avgrensning: eiertenanten må være host-tenanten. Rettighetshaveren logger
// inn der avtalen deres ligger. Rot-hosten ser på tvers (for testing).
//
// Hva som IKKE sendes: kundepris og kundens navn. Rettighetshaveren har krav
// på å vite hva de selv får, når og for hva — ikke byråets margin eller
// byråets kundeliste. Det er byråets forhold (avtalens pkt. 6.1).

export async function GET(request: Request) {
  try {
    let email: string | null = null
    let userId: string | null = null
    let enroll: Record<string, unknown> | null = null
    // Byrået hen kom gjennom (116). Fra app_metadata — som bare serveren kan
    // skrive — aldri fra user_metadata, som brukeren kan endre selv.
    let enrollAgent: { id?: string; tenant_id?: string } | null = null
    const auth = request.headers.get('authorization')
    if (auth?.startsWith('Bearer ')) {
      const { data } = await admin().auth.getUser(auth.slice(7))
      email = data?.user?.email ?? null
      userId = data?.user?.id ?? null
      // Paameldingen (101) baerer radens innhold i metadata til foerste innlogging.
      enroll = (data?.user?.user_metadata as { enroll?: Record<string, unknown> } | undefined)?.enroll ?? null
      enrollAgent = (data?.user?.app_metadata as { enroll_agent?: { id?: string; tenant_id?: string } } | undefined)?.enroll_agent ?? null
    }
    if (!email) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

    const tenant = await getTenant()
    const supabase = admin()

    const FELTER = 'id, tlid, twin_version, owner_tenant_id, name, elevenlabs_voice_id, face_character_id, is_active, is_exclusive, is_public, actor_rate_nok, rates, created_at, offers_voice, wants_face, has_own_recording, enrolled_at, identity_basis, identity_confirmed_by, talent_agent_id, delivered_at'
    let q = supabase
      .from('voice_actors')
      .select(FELTER)
      .ilike('actor_email', likeSafe(email))
    if (tenant.id !== 'root') q = q.eq('owner_tenant_id', tenant.id)
    const { data: rows } = await q.order('created_at', { ascending: true })
    let actors = rows || []

    // 🔑 RADEN LAGES HER, VED FOERSTE INNLOGGING — ikke ved paamelding (101).
    // Da finnes den bare for en e-post noen har bevist at de eier. Metadataene
    // ble skrevet av /api/voice-bank/enroll; identity_basis blir self_declared
    // — eller vouched naar byraaet ligger i app_metadata (116), som bare
    // serveren kan skrive. Aldri fra det hun selv sa.
    // Idempotent: har hun alt en rad i denne banken, roeres ingenting.
    if (actors.length === 0 && enroll && tenant.id !== 'root' && enroll.tenant_id === tenant.id) {
      const e = enroll as Record<string, any>
      // Kom hen gjennom et byrås lenke? Sjekkes på nytt: et byrå som er slått
      // av siden påmeldingen, går ikke lenger god for noen.
      const { byraaMedId, byraaFelter, varsleByraa } = await import('@/lib/byraa')
      const { paameldingsFelter } = await import('@/lib/nivaa')
      const byraa = enrollAgent?.tenant_id === tenant.id ? await byraaMedId(enrollAgent.id, tenant.id) : null
      const viaByraa = byraa ? byraaFelter(byraa.id) : null
      const { data: ny, error: nyFeil } = await supabase
        .from('voice_actors')
        .insert({
          owner_tenant_id: tenant.id,
          name: String(e.name || '').slice(0, 120) || email,
          actor_email: email,
          elevenlabs_voice_id: null,
          honorarium_nok: 0, actor_rate_nok: 0, customer_price_nok: 0, discount_tiers: [],
          is_active: false, is_public: false, is_exclusive: true,
          notes: [`Paameldt ${String(e.enrolled_at || '').slice(0, 10)}`, e.phone ? `Tlf: ${e.phone}` : ''].filter(Boolean).join(' · '),
          bio: e.bio ?? null,
          offers_voice: e.offers_voice !== false,
          wants_face: e.wants_face === true,
          has_own_recording: e.has_own_recording ?? null,
          gender: e.gender ?? null,
          playing_age_from: e.playing_age_from ?? null,
          playing_age_to: e.playing_age_to ?? null,
          height_cm: e.height_cm ?? null,
          attributes: e.attributes && typeof e.attributes === 'object' ? e.attributes : {},
          appearance_consent_at: e.appearance_consent_at ?? null,
          consent_text: e.consent_text ?? null,
          consent_at: e.consent_at ?? null,
          enrolled_at: e.enrolled_at ?? new Date().toISOString(),
          identity_basis: 'self_declared',
          // Byrålenken (116) overstyrer: vouched, med byrået og tidspunktet.
          ...(viaByraa || {}),
          // Nivå og vurdering (123): byrålenken gir «pro» og godtatt; ellers
          // et nytt ansikt som venter på vurdering før noe trenes.
          ...paameldingsFelter(byraa && viaByraa ? { agentId: byraa.id } : null),
          // Artisttype og sang (127). Erklæringen fryses fra konstanten, ikke fra
          // metadataene — dem kan brukeren endre selv. Tomt for et menneske som
          // ikke synger, så påmeldingen virker som før uten 127.
          ...radFelter({
            artistType: lesArtistType(e.artist_kind),
            tilbyrSang: e.offers_singing === true,
            naa: typeof e.virtual_declared_at === 'string' ? e.virtual_declared_at : new Date().toISOString(),
            erklaering: e.virtual_declaration,
          }),
        })
        .select(FELTER)
        .single()
      if (nyFeil) console.error('[me] Kunne ikke opprette paameldt rad:', nyFeil.message)
      else if (ny) {
        actors = [ny as any]
        if (byraa && viaByraa) {
          const { getTenantCanonicalOrigin } = await import('@/lib/tenantServer')
          await varsleByraa({
            byraa, navn: String((ny as { name?: string }).name ?? ''), epost: email, innsigelse: viaByraa.agent_objection_token,
            origin: await getTenantCanonicalOrigin(tenant), merke: tenant.app_name || 'TwinLedger',
          })
        }
      }
    }

    if (actors.length === 0) {
      return NextResponse.json({ tenant: { name: tenant.app_name }, actors: [] })
    }

    // Er rettighetshaveren OGSÅ kunde her? Innlogging oppretter alltid en
    // organisasjon, så «har organisasjon» beviser ingenting. Kunde = har
    // produsert noe eller kjøpt kreditt på dette domenet. En ren
    // rettighetshaver skal ikke se produksjonsflatene (Lars 16/9).
    let isCustomer = false
    if (userId) {
      try {
        let oq = supabase.from('organizations').select('id').eq('owner_id', userId)
        if (tenant.id !== 'root') oq = oq.eq('tenant_id', tenant.id)
        const { data: orgs } = await oq
        const orgIds = (orgs || []).map((o) => o.id as string)
        if (orgIds.length > 0) {
          const [{ count: prod }, { count: tops }] = await Promise.all([
            supabase.from('products').select('id', { count: 'exact', head: true }).in('organization_id', orgIds),
            supabase.from('org_topups').select('id', { count: 'exact', head: true }).in('organization_id', orgIds),
          ])
          isCustomer = (prod ?? 0) > 0 || (tops ?? 0) > 0
        }
      } catch { /* uvisst → behandles som kunde, som før */ isCustomer = true }
    }

    // Byrånavn for «hvem brukte stemmen» — ett oppslag for alle hendelser.
    const tenantNames = new Map<string, string>()
    const nameOf = async (ids: string[]) => {
      const missing = ids.filter((id) => id && !tenantNames.has(id))
      if (missing.length === 0) return
      const { data: ts } = await supabase.from('tenants').select('id, app_name, name').in('id', missing)
      for (const t of ts || []) tenantNames.set(t.id, t.app_name || t.name || 'Ukjent')
    }

    // Byråene som har gått god for henne (116) — navnet vises på /min-stemme.
    const byraaNavn = new Map<string, string>()
    const byraaIder = [...new Set(actors.map((a) => (a as { talent_agent_id?: string | null }).talent_agent_id).filter((x): x is string => !!x))]
    if (byraaIder.length) {
      const { data: tas } = await supabase.from('talent_agents').select('id, name').in('id', byraaIder)
      for (const x of tas || []) byraaNavn.set(x.id as string, x.name as string)
    }

    // Nivå og vurdering (123), i eget oppslag: mangler kolonnene, står resten.
    const nivaaer = new Map<string, { tier: string; intake: string; note: string | null }>()
    {
      const { data: nv } = await supabase.from('voice_actors')
        .select('id, tier, intake_status, intake_note').in('id', actors.map((a) => a.id))
      for (const x of (nv || []) as Array<{ id: string; tier: string; intake_status: string; intake_note: string | null }>) {
        nivaaer.set(x.id, { tier: x.tier, intake: x.intake_status, note: x.intake_note })
      }
    }

    // Artisttype og sang (127), i eget oppslag: mangler kolonnene, står resten.
    const sangInfo = new Map<string, { kind: string; singing: boolean }>()
    {
      const { data: sv } = await supabase.from('voice_actors')
        .select('id, artist_kind, offers_singing').in('id', actors.map((a) => a.id))
      for (const x of (sv || []) as Array<{ id: string; artist_kind: string | null; offers_singing: boolean | null }>) {
        sangInfo.set(x.id, { kind: x.artist_kind === 'virtual' ? 'virtual' : 'human', singing: x.offers_singing === true })
      }
    }

    const out = []
    for (const a of actors) {
      const [settlement, ev, utlegg, avgift] = await Promise.all([
        actorSettlement(a.id),
        supabase
          .from('voice_usage_events')
          .select('id, used_by_tenant_id, actor_rate_nok, meta, asset_type, created_at, licence_id, product_id, draft_id, job_id')
          .eq('actor_id', a.id)
          .order('created_at', { ascending: false })
          .limit(200),
        // Stemmeabonnementet og påmeldingsavgiften (126). Feiler åpent.
        utleggFor(a.id),
        avgiftFor({
          id: a.id as string, owner_tenant_id: a.owner_tenant_id as string,
          talent_agent_id: (a as { talent_agent_id?: string | null }).talent_agent_id ?? null,
          wants_face: (a as { wants_face?: boolean | null }).wants_face ?? null,
        }),
      ])
      const events = ev.data || []
      await nameOf([a.owner_tenant_id as string, ...events.map((e) => e.used_by_tenant_id as string)])

      // HVA tvillingen ble brukt til (128): produksjon, tekst og resultat, så
      // langt lisensen tillater. Filtrert her — det som holdes tilbake, sendes ikke.
      const agentId = (a as { talent_agent_id?: string | null }).talent_agent_id ?? null
      const { innsynForBruk, lisensNivaaer } = await import('@/lib/innsynServer')
      const innsyn = await innsynForBruk({ talentAgentId: agentId, events: events as never })

      // Lisensene rettighetshaveren er bundet av. Hen får se OMFANGET — man kan
      // ikke ha samtykket til en film uten å vite hvilken — og sin egen side av
      // pengene, inkludert fradrag som tas AV honoraret (agent/manager). Ikke
      // kundeprisen og ikke kundens navn: byråets forhold, som ellers i
      // /min-stemme.
      const { data: lics } = await supabase
        .from('licences')
        .select('id, kind, asset_type, status, twin_version, media_class, territory, term_start, term_end, exclusivity, work_title, production_tier, role_scope, fee_actor_nok, comp_model, royalty_pct, release_channel, release_title, created_at')
        .eq('actor_id', a.id)
        .in('status', ['quote', 'active', 'expired'])
        .order('created_at', { ascending: false })
      const licIds = (lics || []).map((l) => l.id as string)
      const lisensInnsyn = agentId ? await lisensNivaaer(licIds) : new Map()
      const [{ data: splits }, { data: steps }, { data: stmts }] = await Promise.all([
        licIds.length
          ? supabase.from('licence_splits').select('licence_id, party_type, party_label, basis, pct, amount_nok').in('licence_id', licIds)
          : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
        licIds.length
          ? supabase.from('licence_steps').select('licence_id, trigger_kind, label, status, actor_nok').in('licence_id', licIds)
          : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
        // Royalty-avregningene. Rettighetshaveren får se grunnlaget — hva vi
        // mottok for utgivelsen — fordi en andel uten synlig grunnlag er et
        // tall man må stole på, og det er nettopp det hovedboken finnes for
        // å slippe.
        licIds.length
          ? supabase.from('royalty_statements')
              .select('licence_id, period_start, period_end, source, net_receipts_nok, artist_pct, artist_nok')
              .in('licence_id', licIds).order('period_start', { ascending: false })
          : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      ])

      // Kun rettighetshaverens egen side av taksten — aldri kundeprisen.
      const rates: Record<string, number> = {}
      const r = (a.rates || {}) as Record<string, { actor_rate_nok?: number }>
      for (const k of Object.keys(r)) if (k !== 'preview' && r[k]?.actor_rate_nok != null) rates[k] = Number(r[k].actor_rate_nok)
      // Proevelytt: naar en kunde tester stemmen. Per 1000 tegn, ikke per bruk.
      const previewRatePer1000 = Number(r.preview?.actor_rate_nok ?? PREVIEW_ROYALTY_PER_1000.actor)

      // Ansiktsmodellen hennes (091): status og de tre proevebildene hun svarte
      // paa. Lars 22.09: «vis dem paa /min-stemme ogsaa» — for et menneske ER
      // de tre bildene modellen. Signert 10 min; eldre offentlige R2-adresser
      // (doede) hoppes over.
      let faceModel: { status: string; approval: string | null; withdrawn: boolean; samples: string[] } | null = null
      if (a.face_character_id) {
        const { data: fm } = await supabase.from('user_characters')
          .select('status, approval_status, withdrawn_at, sample_urls').eq('id', a.face_character_id).maybeSingle()
        if (fm) {
          const stier = (Array.isArray(fm.sample_urls) ? fm.sample_urls : []).filter((s: unknown): s is string => typeof s === 'string' && !s.startsWith('http'))
          const signert = stier.length ? (await supabase.storage.from('training-sets').createSignedUrls(stier, 600)).data || [] : []
          faceModel = { status: String(fm.status), approval: fm.approval_status ?? null, withdrawn: !!fm.withdrawn_at, samples: signert.map((x) => x.signedUrl).filter((u): u is string => !!u) }
        }
      }

      out.push({
        id: a.id,
        tlid: (a.tlid as string | null) ?? null,
        // Gjeldende versjon av tvillingen (112) — lisensene viser hvilken de gjelder.
        twinVersion: Number((a as { twin_version?: number | null }).twin_version) || 1,
        name: a.name,
        hasVoice: !!a.elevenlabs_voice_id,
        hasFace: !!a.face_character_id,
        faceModel,
        isActive: !!a.is_active,
        isExclusive: a.is_exclusive !== false,
        // Paameldingen (101): hva hun tilbyr og hvor langt hun er kommet.
        offersVoice: a.offers_voice !== false,
        wantsFace: a.wants_face === true,
        hasOwnRecording: a.has_own_recording ?? null,
        enrolled: !!a.enrolled_at,
        identityBasis: a.identity_basis ?? null,
        // Hvem som bekreftet identiteten (116, 125): byrået ved navn, «admin», «møte» eller «bankid».
        identityConfirmedBy: (() => {
          const b = lesBekreftelse((a as { identity_confirmed_by?: string | null }).identity_confirmed_by)
          if (b.av === 'byraa') return { kind: 'agency', name: byraaNavn.get(b.agentId) ?? null }
          if (b.av === 'admin') return { kind: 'admin', name: null }
          if (b.av === 'moete') return { kind: 'meeting', name: null }
          if (b.av === 'bankid') return { kind: 'bankid', name: null }
          return null
        })(),
        isPublic: (a as { is_public?: boolean | null }).is_public === true,
        // Nivå og vurdering (123). Uten kolonnene: godtatt, som før.
        tier: nivaaer.get(a.id)?.tier ?? 'new',
        intakeStatus: nivaaer.get(a.id)?.intake ?? 'accepted',
        intakeNote: nivaaer.get(a.id)?.note ?? null,
        delivered: !!a.delivered_at,
        artistKind: sangInfo.get(a.id)?.kind ?? 'human',
        offersSinging: sangInfo.get(a.id)?.singing ?? false,
        // Hun ser beløpet og om refusjonen er overført — ikke hvem som førte det.
        voiceSubscription: utlegg ? {
          amountNok: utlegg.amountNok, payer: utlegg.payer, agencyName: utlegg.agentName,
          status: utlegg.status, refundedAt: utlegg.refundedAt,
        } : null,
        // Bare der den gjelder: uten byrå, med ansikt, og når banken har satt en avgift.
        enrollmentFee: avgift.amountNok != null && !(a as { talent_agent_id?: string | null }).talent_agent_id && a.wants_face === true ? avgift : null,
        defaultRateNok: Number(a.actor_rate_nok),
        rates,
        previewRatePer1000,
        since: a.created_at,
        managedBy: tenantNames.get(a.owner_tenant_id as string) ?? tenant.app_name,
        // Kom hun gjennom et byrå, er det byrået som styrer innsynet (128).
        agencyControlsInsight: !!agentId,
        uses: settlement.uses,
        earnedNok: settlement.earnedNok,
        // Byråets andel (117): det som er frosset på utbetalingene pluss det som
        // trekkes av det som er til gode. Opptjent − byrå − utbetalt = til gode.
        agentNok: settlement.agentNok,
        agency: settlement.agency ? { name: settlement.agency.name, pct: settlement.agency.pct } : null,
        // Delt opp, fordi de to leddene betyr helt ulike ting for den som eier
        // stemmen: måleren er småpenger per bruk, lisensen er honoraret.
        meterNok: settlement.meterNok,
        licenceNok: settlement.licenceNok,
        royaltyNok: settlement.royaltyNok,
        paidNok: settlement.paidNok,
        dueNok: settlement.dueNok,
        payouts: settlement.payouts,
        licences: (lics || []).map((l) => {
          const fradrag = (splits || [])
            .filter((s) => s.licence_id === l.id && s.basis === 'actor_fee')
            .map((s) => ({
              label: (s.party_label as string) || (s.party_type as string),
              pct: s.pct != null ? Number(s.pct) : null,
              amountNok: Number(s.amount_nok),
            }))
          const brutto = Number(l.fee_actor_nok)
          return {
            id: l.id,
            kind: l.kind,
            assetType: l.asset_type,
            status: l.status,
            twinVersion: (l as { twin_version?: number | null }).twin_version ?? null,
            workTitle: l.work_title,
            productionTier: l.production_tier,
            roleScope: l.role_scope,
            mediaClass: l.media_class,
            territory: l.territory,
            termStart: l.term_start,
            termEnd: l.term_end,
            exclusivity: l.exclusivity,
            grossNok: brutto,
            compModel: l.comp_model || 'fee',
            royaltyPct: l.royalty_pct != null ? Number(l.royalty_pct) : null,
            releaseChannel: l.release_channel,
            releaseTitle: l.release_title,
            // Hva hun ser av bruken under lisensen (128). Drop-in: alltid alt.
            insight: agentId ? (lisensInnsyn.get(l.id as string) ?? 'full') : 'full',
            statements: (stmts || [])
              .filter((s) => s.licence_id === l.id)
              .map((s) => ({
                periodStart: s.period_start,
                periodEnd: s.period_end,
                source: s.source,
                basisNok: Number(s.net_receipts_nok),
                pct: Number(s.artist_pct),
                toYouNok: Number(s.artist_nok),
              })),
            deductions: fradrag,
            netNok: Math.round((brutto - fradrag.reduce((s, f) => s + f.amountNok, 0)) * 100) / 100,
            steps: (steps || [])
              .filter((s) => s.licence_id === l.id)
              .map((s) => ({
                trigger: s.trigger_kind,
                label: s.label,
                status: s.status,
                toYouNok: Number(s.actor_nok),
              })),
          }
        }),
        events: events.map((e) => ({
          id: e.id,
          at: e.created_at,
          kind: (e.meta as { kind?: string } | null)?.kind || (e.asset_type === 'face' ? 'face' : 'ukjent'),
          chars: (e.meta as { chars?: number } | null)?.chars ?? null,
          assetType: e.asset_type || 'voice',
          usedBy: tenantNames.get(e.used_by_tenant_id as string) ?? 'Ukjent',
          toYouNok: Number(e.actor_rate_nok),
          // Innsynet (128): null-felter er enten holdt tilbake eller ikke kjent.
          insight: innsyn.get(e.id)?.insight ?? 'production',
          productName: innsyn.get(e.id)?.productName ?? null,
          text: innsyn.get(e.id)?.text ?? null,
          textKind: innsyn.get(e.id)?.textKind ?? null,
          output: innsyn.get(e.id)?.output ?? null,
          // Hjemmelen: hvilken avtale denne ene genereringen skjedde under.
          // Det er dette leddet som gjør hovedboken til et klareringsregister.
          licenceId: (e.licence_id as string) ?? null,
          licenceLabel: e.licence_id
            ? (() => {
                const l = (lics || []).find((x) => x.id === e.licence_id)
                if (!l) return null
                return l.kind === 'work' ? (l.work_title as string) : 'Kampanje'
              })()
            : null,
        })),
      })
    }

    return NextResponse.json({ tenant: { name: tenant.app_name }, actors: out, isCustomer })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Ukjent feil' }, { status: 500 })
  }
}

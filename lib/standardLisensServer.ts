import { createClient } from '@supabase/supabase-js'
import {
  lesVilkaar, standardHinder, aktoerHinder, kjentVilkaarTekst, sammendrag,
  STANDARD_VILKAAR_TEKST, type StandardVilkaar, type Valg,
} from '@/lib/standardLisens'
import type { Asset, MediaClass, Territory, Exclusivity } from '@/lib/rateCard'

// Standardlisens (128) — serverdelen: vilkår, tilbud og kjøp.
//
// 🔑 KJØPET ER ÉN HANDLING MED TRE LEDD: lisensen opprettes (med fordeling og
// byråets andel som på en forhandlet lisens), den aktiveres med vilkårene
// frosset, og prisen trekkes fra saldoen. Feiler et ledd etter at lisensen
// finnes, kanselleres den — en aktiv lisens uten betaling skal ikke finnes.
//
// 🔑 PRISEN ER TAKSTKORTETS, regnet på serveren (foreslaaPris): samme kort og
// samme nivåfaktor som et tilbud fra adminen. Klienten sender aldri en pris.
//
// Server-only.

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
}

type Aktoer = {
  id: string; name: string; tlid: string | null; owner_tenant_id: string; tier: string | null
  is_active: boolean; is_demo: boolean | null; intake_status: string | null; actor_email: string | null
  elevenlabs_voice_id: string | null; face_character_id: string | null
}

async function hentAktoer(actorId: string): Promise<Aktoer | null> {
  const { data } = await db().from('voice_actors')
    .select('id, name, tlid, owner_tenant_id, tier, is_active, is_demo, intake_status, actor_email, elevenlabs_voice_id, face_character_id')
    .eq('id', actorId).maybeSingle()
  return (data as Aktoer | null) ?? null
}

const aktoerFelter = (a: Aktoer) => ({
  tier: a.tier, isActive: !!a.is_active, isDemo: a.is_demo === true, intakeStatus: a.intake_status,
})

/** Har rettighetshaveren det lisensen skal gjelde? En lisens på et ansikt som ikke finnes, er ingenting verdt. */
function evneHinder(a: Aktoer, asset: Asset): string | null {
  const stemme = !!(a.elevenlabs_voice_id && a.elevenlabs_voice_id.trim())
  const ansikt = !!(a.face_character_id && String(a.face_character_id).trim())
  if ((asset === 'voice' || asset === 'both') && !stemme) return 'Rettighetshaveren har ikke stemme i banken ennå.'
  if ((asset === 'face' || asset === 'both') && !ansikt) return 'Rettighetshaveren har ikke ansikt i banken ennå.'
  return null
}

/** Vilkårene til én rettighetshaver, eller null (ikke satt, eller 128 ikke kjørt). */
export async function hentVilkaar(actorId: string): Promise<StandardVilkaar | null> {
  const { data, error } = await db().from('standard_licence_terms').select('*').eq('actor_id', actorId).maybeSingle()
  if (error || !data) return null
  return lesVilkaar(data)
}

/** Lagre vilkårene. `hvem` er e-posten til den som endret — adminen eller rettighetshaveren. */
export async function lagreVilkaar(actorId: string, tenantId: string, v: StandardVilkaar, hvem: string) {
  const { error } = await db().from('standard_licence_terms').upsert({
    actor_id: actorId, tenant_id: tenantId, enabled: v.enabled,
    assets: v.assets, media: v.media, territories: v.territories, max_term_months: v.maxTermMonths,
    updated_by: hvem, updated_at: new Date().toISOString(),
  }, { onConflict: 'actor_id' })
  if (error) throw new Error(error.message)
}

export interface Tilbud {
  available: boolean
  reason: string | null
  priceNok: number | null
  terms: ReturnType<typeof sammendrag> | null
  termsText: typeof STANDARD_VILKAAR_TEKST
}

export function lesValg(b: Record<string, unknown>): Valg {
  return {
    kind: b.kind === 'work' ? 'work' : 'campaign',
    asset: (['voice', 'face', 'both'].includes(String(b.asset)) ? b.asset : 'voice') as Asset,
    mediaClass: (['internal', 'online', 'broadcast'].includes(String(b.mediaClass)) ? b.mediaClass : 'online') as MediaClass,
    territory: (['no', 'nordic', 'world'].includes(String(b.territory)) ? b.territory : 'no') as Territory,
    termMonths: Number(b.termMonths ?? 3),
    exclusivity: (['none', 'category', 'full'].includes(String(b.exclusivity)) ? b.exclusivity : 'none') as Exclusivity,
  }
}

/** Kan dette kjøpes som standardlisens, og hva koster det? Ingen sideeffekter. */
export async function standardTilbud(actorId: string, valg: Valg): Promise<Tilbud> {
  const tom = { priceNok: null, terms: null, termsText: STANDARD_VILKAAR_TEKST }
  const a = await hentAktoer(actorId)
  if (!a) return { ...tom, available: false, reason: 'Ukjent rettighetshaver' }
  const v = await hentVilkaar(actorId)
  const hinder = standardHinder(v, valg, aktoerFelter(a)) ?? evneHinder(a, valg.asset)
  const terms = v && v.enabled && !aktoerHinder(aktoerFelter(a)) ? sammendrag(v) : null
  if (hinder) return { ...tom, terms, available: false, reason: hinder }
  const { foreslaaPris } = await import('@/lib/licences')
  const { listeNok } = await foreslaaPris({
    actorId, tenantId: a.owner_tenant_id, kind: 'campaign', asset: valg.asset,
    mediaClass: valg.mediaClass, territory: valg.territory, termMonths: valg.termMonths, exclusivity: 'none',
  })
  return { available: true, reason: null, priceNok: listeNok, terms, termsText: STANDARD_VILKAAR_TEKST }
}

/** Har rettighetshaveren en standardlisens å tilby i det hele tatt? (for API-svar og knapper) */
export async function harStandard(actorId: string): Promise<ReturnType<typeof sammendrag> | null> {
  const a = await hentAktoer(actorId)
  if (!a || aktoerHinder(aktoerFelter(a))) return null
  const v = await hentVilkaar(actorId)
  return v?.enabled ? sammendrag(v) : null
}

export type KjoepSvar =
  | { ok: true; licenceId: string; priceNok: number; termStart: string; termEnd: string | null; tlid: string | null }
  | { ok: false; status: number; code: string; error: string }

/**
 * Kjøp en standardlisens. `organizationId` er kundens organisasjon på dette
 * domenet (eller nøkkelens); `hvem` er e-posten eller API-nøkkelen som godtok.
 */
export async function kjoepStandardLisens(i: {
  actorId: string; organizationId: string; hvem: string; valg: Valg
  productionTitle: string | null; termsText: unknown; via: 'web' | 'api'; customerLabel?: string | null
}): Promise<KjoepSvar> {
  const tekst = kjentVilkaarTekst(i.termsText)
  if (!tekst) return { ok: false, status: 400, code: 'TERMS_REQUIRED', error: 'Standardvilkårene må godtas.' }

  const a = await hentAktoer(i.actorId)
  if (!a) return { ok: false, status: 404, code: 'UNKNOWN_ACTOR', error: 'Ukjent rettighetshaver' }
  const v = await hentVilkaar(i.actorId)
  const hinder = standardHinder(v, i.valg, aktoerFelter(a)) ?? evneHinder(a, i.valg.asset)
  if (hinder) return { ok: false, status: 409, code: 'NOT_STANDARD', error: `${hinder} Be om lisens i stedet, så kommer vi tilbake med et tilbud.` }

  // Dobbeltklikk og dobbeltkjøp: har kunden alt en aktiv lisens på det samme,
  // som gjelder i dag, kjøpes ikke en til.
  const idag = new Date().toISOString().slice(0, 10)
  const { data: finnes } = await db().from('licences')
    .select('id, term_end').eq('actor_id', a.id).eq('organization_id', i.organizationId).eq('status', 'active')
    .eq('kind', 'campaign').eq('asset_type', i.valg.asset).eq('media_class', i.valg.mediaClass).eq('territory', i.valg.territory)
  if ((finnes || []).some((l) => !l.term_end || String(l.term_end) >= idag)) {
    return { ok: false, status: 409, code: 'ALREADY_LICENSED', error: 'Dere har alt en aktiv lisens som dekker dette.' }
  }

  const { foreslaaPris, opprettLisens } = await import('@/lib/licences')
  const { listeNok } = await foreslaaPris({
    actorId: a.id, tenantId: a.owner_tenant_id, kind: 'campaign', asset: i.valg.asset,
    mediaClass: i.valg.mediaClass, territory: i.valg.territory, termMonths: i.valg.termMonths, exclusivity: 'none',
  })

  // Saldoen før noe opprettes.
  const { getOrgBalance } = await import('@/lib/tenantBilling')
  const saldo = await getOrgBalance(i.organizationId)
  if (saldo === null || saldo < listeNok) {
    return {
      ok: false, status: 402, code: 'BALANCE_TOO_LOW',
      error: saldo === null
        ? `Kontoen har ingen forskuddssaldo. Lisensen koster ${listeNok} kr.`
        : `Saldoen (${Math.round(saldo * 100) / 100} kr) dekker ikke lisensen (${listeNok} kr).`,
    }
  }

  // Byråets andel av honoraret (117), som på en forhandlet lisens.
  const { actorAgency } = await import('@/lib/actorLedger')
  const byraa = await actorAgency(a.id)
  const splits = byraa && byraa.pct > 0
    ? [{ party_type: 'agent' as const, party_label: byraa.name, basis: 'actor_fee' as const, pct: byraa.pct }]
    : []

  const tittel = (i.productionTitle || '').trim().slice(0, 200) || null
  const lisens = await opprettLisens({
    actorId: a.id, tenantId: a.owner_tenant_id, organizationId: i.organizationId,
    customerLabel: i.customerLabel ?? null, kind: 'campaign', asset: i.valg.asset,
    mediaClass: i.valg.mediaClass, territory: i.valg.territory, termMonths: i.valg.termMonths, exclusivity: 'none',
    splits, notes: `Standardlisens${tittel ? `: «${tittel}»` : ''} (${i.via === 'api' ? 'API' : 'nett'})`,
    createdBy: i.hvem,
  })

  const avbryt = async (grunn: string) => {
    await db().from('licences').update({ status: 'cancelled', notes: `Kjøpet ble ikke fullført: ${grunn}` }).eq('id', lisens.id)
  }

  const naa = new Date().toISOString()
  const { data: aktiv, error: aFeil } = await db().from('licences').update({
    status: 'active', signed_at: naa, source: 'standard',
    terms_text: tekst, terms_accepted_at: naa, terms_accepted_by: i.hvem,
  }).eq('id', lisens.id).select('term_start, term_end').single()
  if (aFeil || !aktiv) {
    await avbryt(aFeil?.message || 'aktivering')
    return { ok: false, status: 500, code: 'ACTIVATE_FAILED', error: 'Lisensen kunne ikke aktiveres. Ingenting er trukket.' }
  }

  // Trekk prisen fra saldoen. cost_nok = 0: lisensen er ikke produksjonskost
  // for noe ledd — fordelingen ligger på lisensen (licence_splits).
  const { error: uFeil } = await db().from('usage_events').insert({
    tenant_id: a.owner_tenant_id, organization_id: i.organizationId, event_type: 'licence_standard',
    cost_nok: 0, customer_cost_nok: lisens.feeCustomer,
    meta: { licence_id: lisens.id, actor_id: a.id, via: i.via },
  })
  if (uFeil) {
    await avbryt(`belastning: ${uFeil.message}`)
    return { ok: false, status: 500, code: 'CHARGE_FAILED', error: 'Betalingen kunne ikke føres. Lisensen er ikke aktiv, og ingenting er trukket.' }
  }

  await varsle(a, { licenceId: lisens.id, prisNok: lisens.feeCustomer, honorarNok: lisens.feeActor, valg: i.valg, tittel, kunde: i.customerLabel ?? null })
  return { ok: true, licenceId: lisens.id, priceNok: lisens.feeCustomer, termStart: String(aktiv.term_start), termEnd: aktiv.term_end ? String(aktiv.term_end) : null, tlid: a.tlid }
}

/** Si fra til rettighetshaveren og bankens admins. Feiler stille — lisensen står. */
async function varsle(a: Aktoer, i: { licenceId: string; prisNok: number; honorarNok: number; valg: Valg; tittel: string | null; kunde: string | null }) {
  try {
    if (!process.env.RESEND_API_KEY) return
    const { tenantChainUp } = await import('@/lib/voiceBank')
    const kjede = await tenantChainUp(a.owner_tenant_id)
    const { data: tenants } = await db().from('tenants').select('id, app_name, admin_emails').in('id', kjede)
    const admins = [...new Set((tenants || []).flatMap((t) => (Array.isArray(t.admin_emails) ? t.admin_emails : []))
      .map((e: unknown) => String(e).trim()).filter((e) => e.includes('@')))]
    const merke = (tenants || []).find((t) => t.id === a.owner_tenant_id)?.app_name || 'TwinLedger'
    const hva = { voice: 'stemmen', face: 'ansiktet', both: 'stemmen og ansiktet' }[i.valg.asset]
    const medium = { internal: 'intern bruk', online: 'nett og sosiale medier', broadcast: 'kringkasting' }[i.valg.mediaClass]
    const omraade = { no: 'Norge', nordic: 'Norden', world: 'hele verden' }[i.valg.territory]
    const linje = `${i.kunde ? `${i.kunde} har` : 'En kunde har'} fått standardlisens på ${hva} til ${a.name}: ${medium}, ${omraade}, ${i.valg.termMonths} måneder${i.tittel ? ` («${i.tittel}»)` : ''}.`
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    if (a.actor_email) {
      const { error } = await resend.emails.send({
        from: `${merke} <no-reply@send.norditech.io>`, to: a.actor_email,
        subject: `Ny lisens: ${hva} i ${medium}`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1A16">
          <p>${linje}</p><p>Honoraret ditt er <strong>${i.honorarNok} kr</strong>, før eventuell andel til byrået. Det står på siden din, sammen med all bruk under lisensen.</p>
          <p style="color:#6B6358;font-size:14px">Lisensen ble gitt automatisk etter standardvilkårene du har sagt ja til. Du kan slå standardlisensen av på siden din når du vil; lisenser som alt er gitt, gjelder ut perioden.</p></div>`,
      })
      if (error) console.error('[standardlisens] e-post til rettighetshaver feilet:', error.message)
    }
    if (admins.length) {
      const { error } = await resend.emails.send({
        from: `${merke} <no-reply@send.norditech.io>`, to: admins,
        subject: `Standardlisens solgt: ${a.name} (${i.prisNok} kr)`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1C1A16"><p>${linje}</p><p>Pris ${i.prisNok} kr, trukket fra kundens saldo. Lisens ${i.licenceId}.</p></div>`,
      })
      if (error) console.error('[standardlisens] e-post til admins feilet:', error.message)
    }
  } catch (e) {
    console.error('[standardlisens] varsel feilet:', e instanceof Error ? e.message : e)
  }
}

/** Kundens lisenser på én rettighetshaver (eller alle), til skjermen og API-et. */
export async function kundensLisenser(organizationId: string, actorId?: string) {
  let q = db().from('licences')
    .select('id, actor_id, kind, asset_type, media_class, territory, term_start, term_end, exclusivity, work_title, fee_customer_nok, status, source, twin_version, created_at')
    .eq('organization_id', organizationId).in('status', ['active', 'expired', 'quote'])
    .order('created_at', { ascending: false }).limit(100)
  if (actorId) q = q.eq('actor_id', actorId)
  const { data } = await q
  return (data || []).map((l) => ({
    id: l.id, actorId: l.actor_id, kind: l.kind, asset: l.asset_type, mediaClass: l.media_class, territory: l.territory,
    termStart: l.term_start, termEnd: l.term_end, exclusivity: l.exclusivity, workTitle: l.work_title,
    priceNok: Number(l.fee_customer_nok), status: l.status, source: (l as { source?: string }).source ?? 'negotiated',
    twinVersion: l.twin_version, createdAt: l.created_at,
  }))
}

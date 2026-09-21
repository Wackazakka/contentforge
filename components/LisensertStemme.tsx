'use client'

import Link from 'next/link'
import { dobbeltstrek } from '@/components/TwinLedgerLogo'

// Rettighetshaverne som EGEN FLATE over biblioteket (Claude Design 7D, 21.09.2026).
//
// 🔑 SKUESPILLEREN STÅR ØVERST, IKKE UNDER LAGERSTEMMENE. Før dette lå banken
// som en ettertanke nederst i stemmevelgeren, under tolv ElevenLabs-stemmer og
// over et fritekstfelt. Rekkefølgen er ikke pynt: den sier hva produktet er.
// Selger man klarering, kan ikke den klarerte stemmen være det siste valget på
// lista.
//
// 🔑 HJEMMELEN VISES FØR PRODUKSJONEN, IKKE ETTER. `finnLisensFor` har hele
// tiden svart på «hvilken avtale ga lov?» — men i det bruken ble logget, uten
// at noen så svaret. Et `none` ble et ærlig hull ingen oppdaget. Her stilles
// samme spørsmål med samme inndata, før noe er produsert, slik at hullet blir
// et valg i stedet for et funn i etterkant.
//
// ⚠️ PORTEN GJELDER KUN DER LISENSEN ER KLARERINGEN. På CenterForge og
// white-label-kjedene er skuespillerstemmer klarert gjennom pris-per-bruk og
// royalty ved avregning — der finnes ingen `licences`-rad å kreve, og en
// port ville stengt en flate som virker i dag. Derfor `rettighetsmodus`.

export interface BankStemme {
  id: string
  name: string
  voiceId: string
  pricePerUseNok: number
  /**
   * Hva rettighetshaveren tjener på bruken. `null` utenfor TwinLedger — se
   * porten i /api/voice-actors: differansen mot kundeprisen er leddets margin,
   * og den hører ikke hjemme hos en white-label-kjedes kunder.
   */
  actorRateNok?: number | null
  previewUrl: string | null
  /** null = ikke spurt (uten produkt finnes ingen kunde å spørre på vegne av). */
  licence: { licenceId: string | null; match: string } | null
}

const MONO = 'var(--font-cfmono), ui-monospace, monospace'

const kr = (n: number) =>
  n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Hva bruken koster, og hvem pengene går til.
 *
 * 🔑 TALLET ER IKKE ET ANSLAG. `actor_earnings` summerer nøyaktig den satsen
 * som vises her, så linja «Til rettighetshaveren» er det hen faktisk får —
 * ikke en prosent regnet ut på skjermen. En prosentsats hentet fra takstkortet
 * ville vært feil vare: den styrer fordelingen av et LISENSHONORAR, mens dette
 * er bruksprisen per produksjon. To ulike penger.
 *
 * Bokføringens konvensjon: delene først, enkel strek, sum, dobbel strek.
 */
function Kostnadspanel({ s }: { s: BankStemme }) {
  if (s.actorRateNok == null) return null
  const plattform = Math.round((s.pricePerUseNok - s.actorRateNok) * 100) / 100
  const rad = {
    display: 'flex', justifyContent: 'space-between', gap: 16,
    padding: '7px 0', fontSize: 13.5,
  } as const
  const tall = { fontFamily: MONO, fontSize: 13, fontVariantNumeric: 'tabular-nums' } as const

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', border: '1px solid var(--ds-border-strong, #D8D4CC)', background: 'var(--paper-raised)' }}>
      <p style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 6px' }}>
        Per produksjon
      </p>
      <div style={rad}>
        <span style={{ color: 'var(--ink)' }}>Til {s.name}</span>
        <span style={tall}>{kr(s.actorRateNok)}</span>
      </div>
      <div style={{ ...rad, borderTop: '1px solid var(--ds-border-faint, #E8E4DC)', color: 'var(--text-muted, #6B6B6B)' }}>
        <span>Til TwinLedger</span>
        <span style={tall}>{kr(plattform)}</span>
      </div>
      <div style={{ ...rad, ...dobbeltstrek(), marginTop: 2, fontWeight: 700 }}>
        <span>Du betaler</span>
        <span style={{ ...tall, fontWeight: 700 }}>{kr(s.pricePerUseNok)}</span>
      </div>
      {/* Negativ plattformandel skjules ikke. Den betyr at satsen er satt
          høyere enn kundeprisen, og det er en feil i takstkortet man skal se —
          ikke et tall som skal rundes bort på skjermen. */}
      {plattform < 0 && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ember-deep)' }}>
          Satsen ligger over kundeprisen. Sjekk takstene på {s.name}.
        </p>
      )}
    </div>
  )
}

/** Kan denne stemmen produseres med? `null` (ikke spurt) teller som ja — se filtoppen. */
export function harHjemmel(s: BankStemme): boolean {
  return !s.licence || s.licence.match === 'explicit' || s.licence.match === 'inferred'
}

/**
 * Er «Produser» stengt? Sann bare når en av bankens stemmer er valgt OG
 * hjemmelen mangler. Lagerstemmer og innlimte ID-er rører denne ikke — de
 * har ingen rettighetshaver å stenge på vegne av.
 */
export function lisensSperrer(stemmer: BankStemme[], valgtVoiceId: string, rettighetsmodus: boolean): boolean {
  if (!rettighetsmodus) return false
  const valgt = stemmer.find((s) => s.voiceId === valgtVoiceId)
  return !!valgt && !harHjemmel(valgt)
}

function Merke({ s }: { s: BankStemme }) {
  if (!s.licence) return null
  const { match } = s.licence
  const paaPlass = match === 'explicit' || match === 'inferred'
  const uavklart = match === 'ambiguous'
  return (
    <span
      style={{
        display: 'inline-block', marginTop: 6, padding: '2px 6px',
        fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
        border: `1px solid ${paaPlass ? 'var(--ink)' : 'var(--ember-deep)'}`,
        color: paaPlass ? 'var(--ink)' : 'var(--ember-deep)',
      }}
    >
      {paaPlass ? 'Lisens på plass' : uavklart ? 'Uavklart' : 'Ingen lisens'}
    </span>
  )
}

export default function LisensertStemme({
  stemmer, valgt, velg, rettighetsmodus, enhet = 'produksjon',
}: {
  stemmer: BankStemme[]
  valgt: string
  velg: (voiceId: string) => void
  rettighetsmodus: boolean
  enhet?: string
}) {
  if (stemmer.length === 0) return null
  const valgtStemme = stemmer.find((s) => s.voiceId === valgt)
  const sperret = rettighetsmodus && !!valgtStemme && !harHjemmel(valgtStemme)
  const uavklart = sperret && valgtStemme?.licence?.match === 'ambiguous'
  const kant = rettighetsmodus ? 0 : 8

  return (
    <div style={{ border: '2px solid var(--ink)', borderRadius: kant, padding: 14, marginBottom: 16 }}>
      <p style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 10px' }}>
        {rettighetsmodus ? 'Lisensierte stemmer' : 'Stemmebanken'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
        {stemmer.map((s) => {
          const paa = valgt === s.voiceId
          const mangler = rettighetsmodus && !harHjemmel(s)
          return (
            <button
              key={s.voiceId}
              type="button"
              onClick={() => velg(s.voiceId)}
              aria-pressed={paa}
              style={{
                textAlign: 'left', padding: 10, cursor: 'pointer', font: 'inherit',
                borderRadius: kant,
                border: `2px solid ${paa ? 'var(--ember-deep)' : 'var(--ds-border-strong, #D8D4CC)'}`,
                background: paa ? 'var(--ember-tint-bg)' : 'var(--paper-raised)',
                // Mangler hjemmelen, dempes stemmen — men den blir stående og
                // klikkbar. En skjult stemme ser ut som en stemme som ikke
                // finnes; en dempet sier «denne mangler noe», og trykker man,
                // står det hva.
                opacity: mangler ? 0.62 : 1,
              }}
            >
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{s.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted, #6B6B6B)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {s.pricePerUseNok.toFixed(2).replace('.', ',')} kr per {enhet}
              </span>
              <Merke s={s} />
            </button>
          )
        })}
      </div>

      {sperret && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: kant, border: '1px solid var(--ember-deep)', background: 'var(--ember-tint-bg)' }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)' }}>
            {uavklart
              ? 'Flere aktive lisenser dekker denne bruken. Hovedboken kan ikke velge mellom dem, og produksjonen ville blitt stående uten hjemmel.'
              : `Det finnes ingen aktiv lisens på ${valgtStemme?.name} for denne kunden. Produksjonen er stengt til lisensen er på plass.`}
          </p>
          <Link href="/dashboard/voice-bank" style={{ display: 'inline-block', marginTop: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--ember-deep)' }}>
            {uavklart ? 'Rydd opp i lisensene →' : 'Opprett lisens →'}
          </Link>
        </div>
      )}

      {/* Står også når produksjonen er stengt: det er nettopp da man skal
          kunne se hva lisensen ville koste per bruk. */}
      {valgtStemme && <Kostnadspanel s={valgtStemme} />}
    </div>
  )
}

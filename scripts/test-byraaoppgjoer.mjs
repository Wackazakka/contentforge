// Byråets andel av oppgjøret (lib/byraaOppgjoer.ts)
// Kjør:  node --experimental-strip-types scripts/test-byraaoppgjoer.mjs
import { tilGode, fordelUtbetaling, byraaProsent } from '../lib/byraaOppgjoer.ts'

let ok = 0, feil = 0
const sjekk = (navn, faktisk, forventet) => {
  const likt = JSON.stringify(faktisk) === JSON.stringify(forventet)
  if (likt) ok++; else { feil++; console.log('FEIL:', navn, '\n  fikk     ', JSON.stringify(faktisk), '\n  forventet', JSON.stringify(forventet)) }
}
const ingen = { grossNok: 0, netNok: 0, cutNok: 0, baseNok: 0, licenceAgentNok: 0 }
const etter = (a, u) => ({ // legg en utbetaling til det som er avregnet
  grossNok: a.grossNok + u.gross_nok, netNok: a.netNok + u.amount_nok, cutNok: a.cutNok + u.agent_cut_nok,
  baseNok: a.baseNok + u.commission_base_nok, licenceAgentNok: a.licenceAgentNok + u.licence_agent_nok,
})

// 1. Uten byrå: alt til henne, som før
const o1 = { meterNok: 1000, royaltyNok: 0, licenceFeeNok: 0, licenceAgentNok: 0 }
let t = tilGode(o1, ingen, 15, false)
sjekk('uten byrå: netto = brutto', [t.grossNok, t.cutNok, t.netNok], [1000, 0, 1000])

// 2. Byrå 15 % på per bruk
t = tilGode(o1, ingen, 15, true)
sjekk('15 % av 1000', [t.grossNok, t.cutNok, t.netNok], [1000, 150, 850])
let u = fordelUtbetaling(t, 850)
sjekk('hel utbetaling: brutto = netto + kutt', [u.gross_nok, u.amount_nok, u.agent_cut_nok, u.commission_base_nok, u.agent_pct], [1000, 850, 150, 1000, 15])
let a = etter(ingen, u)
sjekk('etter utbetaling: ingenting til gode', tilGode(o1, a, 15, true).netNok, 0)

// 3. Prosenten endres etterpå: det utbetalte rører seg ikke, det nye får ny sats
const o3 = { ...o1, meterNok: 1400 }
t = tilGode(o3, a, 20, true)
sjekk('ny sats bare på det nye', [t.baseNok, t.cutNok, t.netNok], [400, 80, 320])

// 4. Lisens med byråandel på lisensen: prosenten legges IKKE på igjen
const o4 = { meterNok: 0, royaltyNok: 0, licenceFeeNok: 50000, licenceAgentNok: 7500 }
t = tilGode(o4, ingen, 15, true)
sjekk('lisens: andelen fra lisensen, ikke 15 % i tillegg', [t.grossNok, t.commissionNok, t.licenceAgentNok, t.cutNok, t.netNok], [50000, 0, 7500, 7500, 42500])

// 5. Lisens uten byrå i systemet: ingen trekk (som før)
t = tilGode(o4, ingen, 0, false)
sjekk('lisens uten byrå: hele honoraret', [t.cutNok, t.netNok], [0, 50000])

// 6. Blandet: per bruk + royalty + lisens
const o6 = { meterNok: 2000, royaltyNok: 3000, licenceFeeNok: 20000, licenceAgentNok: 3000 }
t = tilGode(o6, ingen, 15, true)
sjekk('blandet', [t.grossNok, t.baseNok, t.commissionNok, t.licenceAgentNok, t.cutNok, t.netNok], [25000, 5000, 750, 3000, 3750, 21250])

// 7. Delutbetaling: forholdsmessig, og resten står igjen eksakt
u = fordelUtbetaling(t, 10625) // halvparten
sjekk('halv utbetaling', [u.amount_nok, u.agent_cut_nok, u.gross_nok, u.commission_base_nok, u.licence_agent_nok], [10625, 1875, 12500, 2500, 1500])
a = etter(ingen, u)
const rest = tilGode(o6, a, 15, true)
sjekk('resten etter halv', [rest.grossNok, rest.cutNok, rest.netNok], [12500, 1875, 10625])
sjekk('resten kan utbetales helt', fordelUtbetaling(rest, rest.netNok).gross_nok, 12500)

// 8. Vern
sjekk('mer enn til gode avvises', fordelUtbetaling(tilGode(o1, ingen, 15, true), 851), null)
sjekk('null avvises', fordelUtbetaling(tilGode(o1, ingen, 15, true), 0), null)
const smaa = tilGode({ ...o1, meterNok: 0.3 }, ingen, 15, true)
const su = fordelUtbetaling(smaa, smaa.netNok)
sjekk('øre: brutto = netto + kutt eksakt', [su.gross_nok, Math.round((su.amount_nok + su.agent_cut_nok) * 100) / 100], [0.3, 0.3])

// 9. Sats
sjekk('forhandlet sats vinner', byraaProsent(12, 15), 12)
sjekk('standardsats når ingen forhandlet', byraaProsent(null, 15), 15)
sjekk('ingen sats = 0', byraaProsent(null, null), 0)
sjekk('over 100 kappes', byraaProsent(150, null), 100)

// 10. Historikk fra før 117: alt utbetalt var per bruk (base = brutto)
const hist = { grossNok: 600, netNok: 600, cutNok: 0, baseNok: 600, licenceAgentNok: 0 }
t = tilGode({ meterNok: 1000, royaltyNok: 0, licenceFeeNok: 0, licenceAgentNok: 0 }, hist, 15, true)
sjekk('byrå etter tidligere utbetaling: bare det nye', [t.baseNok, t.cutNok, t.netNok], [400, 60, 340])

console.log(`${ok} ok, ${feil} feil`)
process.exit(feil ? 1 : 0)

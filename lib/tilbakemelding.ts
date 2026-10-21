// Tilbakemeldingsskjemaet for PromoMaker-testerne (Lars 21.10.2026). Møtet
// 27.10 ble avlyst, så tilbakemeldingen kommer herfra. Formålet: David skal
// kunne avgjøre om PromoMaker er god nok til å slippes for alle brukerne.
//
// Bonus: har testeren under GRENSE kreditter igjen når skjemaet sendes inn,
// og fristen ikke er ute, får hun BONUS nye med en gang (én gang per person).
// Avhenger av AT man svarer, aldri av HVA man svarer.
//
// Delt av siden (/tilbakemelding) og ruta (/api/tilbakemelding) — begge
// validerer mot de samme spørsmålene. Ingen server-importer her.

export const UNDERSOKELSE = {
  id: 'promomaker-test-2026-10',
  tenantSlug: 'indigoboom',
  // Tirsdag 27.10 kl. 23:59 norsk tid. Vintertid fra søndag 25.10 → UTC+1.
  bonusFrist: '2026-10-27T22:59:59Z',
  bonusFristTekst: 'tirsdag 27. oktober',
  grenseKreditter: 200,
  bonusKreditter: 3000,
} as const

export type Sporsmal =
  | { id: string; type: 'ett'; tekst: string; valg: string[]; kreves?: boolean | 'hvisVideo'; hint?: string }
  | { id: string; type: 'flere'; tekst: string; valg: string[]; annet?: boolean; hint?: string }
  | { id: string; type: 'skala'; tekst: string; fra: number; til: number; lav: string; hoy: string; kreves?: boolean | 'hvisVideo'; hint?: string }
  | { id: string; type: 'tekst'; tekst: string; hint?: string }
  | { id: string; type: 'feil'; tekst: string }

export const SEKSJONER: Array<{ tittel: string; sporsmal: Sporsmal[] }> = [
  {
    tittel: 'Kom du i gang?',
    sporsmal: [
      { id: 'ferdig_video', type: 'ett', tekst: 'Fikk du laget en ferdig video?', kreves: true,
        valg: ['Ja, uten hjelp', 'Ja, men det var vanskelig', 'Nei, jeg ga opp', 'Nei, jeg rakk det ikke'] },
      { id: 'stoppet', type: 'flere', tekst: 'Stoppet du opp eller ble usikker noe sted?', hint: 'Kryss av for alt som passer.', annet: true,
        valg: ['Velge passord og logge inn', 'Legge til artisten', 'Laste opp musikk', 'Laste opp bilder', 'Skjemaet for ny video', 'Gå gjennom scenene', 'Stemme', 'Bevegelse', 'Vente på videoen', 'Laste ned'] },
      { id: 'lett', type: 'skala', tekst: 'Hvor lett var det alt i alt?', fra: 1, til: 5, lav: 'Veldig vanskelig', hoy: 'Veldig lett', kreves: true },
    ],
  },
  {
    tittel: 'Resultatet',
    sporsmal: [
      { id: 'fornoyd', type: 'skala', tekst: 'Hvor fornøyd er du med videoen?', fra: 1, til: 5, lav: 'Ikke fornøyd', hoy: 'Veldig fornøyd', kreves: 'hvisVideo' },
      { id: 'legge_ut', type: 'ett', tekst: 'Ville du lagt ut videoen på TikTok, Instagram eller YouTube?', kreves: 'hvisVideo',
        valg: ['Ja, som den er', 'Ja, etter små endringer', 'Nei'] },
      { id: 'best', type: 'tekst', tekst: 'Hva var best?' },
      { id: 'bedre', type: 'tekst', tekst: 'Hva kunne vært bedre?' },
    ],
  },
  {
    tittel: 'Feil',
    sporsmal: [
      { id: 'feil', type: 'feil', tekst: 'Opplevde du at noe ikke virket, forsvant eller tok veldig lang tid?' },
    ],
  },
  {
    tittel: 'Verdi',
    sporsmal: [
      { id: 'neste_slipp', type: 'skala', tekst: 'Hvor sannsynlig er det at du bruker PromoMaker til neste slipp?', fra: 0, til: 10, lav: 'Ikke sannsynlig', hoy: 'Helt sikkert', kreves: true },
      { id: 'pris', type: 'ett', tekst: 'Hva ville vært en fair pris for en video som den du laget?',
        valg: ['100–200 kr', '200–300 kr', '300–500 kr', '500–1000 kr', 'over 1000 kr'] },
      { id: 'annet', type: 'tekst', tekst: 'Noe annet du vil si?' },
    ],
  },
]

export type Svar = Record<string, string | number | string[] | { ja: boolean; beskrivelse?: string } | undefined>

// «Hvis video»: spørsmålene om resultatet kreves bare av dem som fikk laget en
export function fikkVideo(svar: Svar): boolean {
  return String(svar.ferdig_video || '').startsWith('Ja')
}

// Returnerer id-ene som mangler svar (tom liste = gyldig). Rydder samtidig
// bort alt som ikke hører til skjemaet og kapper fritekst.
export function validerSvar(raw: unknown): { svar: Svar; mangler: string[] } {
  const inn = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const svar: Svar = {}
  const mangler: string[] = []
  const tekst = (v: unknown) => String(v ?? '').trim().slice(0, 4000)
  const alle = SEKSJONER.flatMap((s) => s.sporsmal)
  for (const s of alle) {
    const v = inn[s.id]
    if (s.type === 'ett') {
      if (typeof v === 'string' && s.valg.includes(v)) svar[s.id] = v
    } else if (s.type === 'flere') {
      const liste = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && s.valg.includes(x)) : []
      if (liste.length) svar[s.id] = liste
      const annet = tekst(inn[`${s.id}_annet`])
      if (s.annet && annet) svar[`${s.id}_annet`] = annet
    } else if (s.type === 'skala') {
      const n = Number(v)
      if (Number.isInteger(n) && n >= s.fra && n <= s.til) svar[s.id] = n
    } else if (s.type === 'tekst') {
      const t = tekst(v)
      if (t) svar[s.id] = t
    } else if (s.type === 'feil') {
      const f = (v && typeof v === 'object' ? v : {}) as { ja?: unknown; beskrivelse?: unknown }
      if (f.ja === true || f.ja === false) svar[s.id] = { ja: f.ja, ...(f.ja ? { beskrivelse: tekst(f.beskrivelse) } : {}) }
    }
  }
  const video = fikkVideo(svar)
  for (const s of alle) {
    const kreves = 'kreves' in s ? s.kreves : false
    if ((kreves === true || (kreves === 'hvisVideo' && video)) && svar[s.id] === undefined) mangler.push(s.id)
  }
  return { svar, mangler }
}

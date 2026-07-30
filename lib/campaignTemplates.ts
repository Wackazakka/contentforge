// Kampanjemaler per vertikal: strukturerte brief-er som forhåndsfyller
// ny-produksjon-skjemaet (tittel/tema/målgruppe/problem/CTA). Brukeren
// redigerer fritt etterpå — malen er et stillas, ikke en låsing.
//
// Tekstene ligger her (ikke i messages/verticals/*) fordi de fylles inn i
// REDIGERBARE skjemafelt og blir del av brukerens brief — de er såkorn-
// innhold, ikke UI-etiketter. «…»-markørene viser hva brukeren skal bytte ut.

export type Locale = 'no' | 'en'

export interface CampaignTemplate {
  key: string
  emoji: string
  label: Record<Locale, string>
  hint: Record<Locale, string>
  prefill: {
    title: Record<Locale, string>
    topic: Record<Locale, string>
    targetAudience: Record<Locale, string>
    problem: Record<Locale, string>
    cta: Record<Locale, string>
  }
}

export const CAMPAIGN_TEMPLATES: Record<string, CampaignTemplate[]> = {
  music: [
    {
      key: 'single',
      emoji: '🎵',
      label: { no: 'Singelslipp', en: 'Single release' },
      hint: { no: 'Ny låt på vei ut — bygg forventning og forhåndslagringer', en: 'New track on the way — build anticipation and pre-saves' },
      prefill: {
        title: { no: 'Singelslipp: «…»', en: 'Single release: "…"' },
        topic: {
          no: 'Singelen «…» slippes … (dato). Låten handler om … Forhåndslagre nå.',
          en: 'Our single "…" drops on … (date). The song is about … Pre-save now.',
        },
        targetAudience: { no: 'Fansen vår + folk som hører på lignende artister', en: 'Our fans + listeners of similar artists' },
        problem: { no: 'Ny musikk drukner i strømmen uten promo som skiller seg ut', en: 'New music drowns in the feed without promo that stands out' },
        cta: { no: 'Forhåndslagre på Spotify', en: 'Pre-save on Spotify' },
      },
    },
    {
      key: 'album',
      emoji: '💿',
      label: { no: 'Albumslipp', en: 'Album release' },
      hint: { no: 'Helt album eller EP — fortell historien bak', en: 'Full album or EP — tell the story behind it' },
      prefill: {
        title: { no: 'Albumslipp: «…»', en: 'Album release: "…"' },
        topic: {
          no: 'Albumet «…» slippes … (dato). … låter om … Innspilt i/med … Historien bak: …',
          en: 'Our album "…" is out … (date). … tracks about … Recorded in/with … The story behind it: …',
        },
        targetAudience: { no: 'Fansen vår + spillelistekuratorer og musikkinteresserte', en: 'Our fans + playlist curators and music lovers' },
        problem: { no: 'Album forsvinner uten en fortelling folk kan dele', en: 'Albums disappear without a story people can share' },
        cta: { no: 'Hør hele albumet', en: 'Listen to the full album' },
      },
    },
    {
      key: 'tour',
      emoji: '🚌',
      label: { no: 'Turné', en: 'Tour' },
      hint: { no: 'Flere datoer — få folk til å finne sin by', en: 'Multiple dates — help people find their city' },
      prefill: {
        title: { no: 'Turné: … (høst/vår …)', en: 'Tour: … (season …)' },
        topic: {
          no: 'Vi legger ut på turné: … (by + dato), … (by + dato), … (by + dato). Billetter ute nå.',
          en: 'We are going on tour: … (city + date), … (city + date), … (city + date). Tickets on sale now.',
        },
        targetAudience: { no: 'Fans i byene vi besøker', en: 'Fans in the cities we visit' },
        problem: { no: 'Folk oppdager konserten først når den er utsolgt eller over', en: 'People discover the show only when it is sold out or over' },
        cta: { no: 'Finn din by og kjøp billett', en: 'Find your city and get tickets' },
      },
    },
    {
      key: 'concert',
      emoji: '🎤',
      label: { no: 'Enkeltkonsert', en: 'Single show' },
      hint: { no: 'Ett venue, én dato — selg akkurat denne kvelden', en: 'One venue, one date — sell this exact night' },
      prefill: {
        title: { no: 'Konsert: … (venue, dato)', en: 'Show: … (venue, date)' },
        topic: {
          no: 'Vi spiller på … (venue) i … (by) den … (dato). Dørene åpner … Support: … Billetter: …',
          en: 'We are playing … (venue) in … (city) on … (date). Doors at … Support: … Tickets: …',
        },
        targetAudience: { no: 'Konsertgjengere i … (by) og omegn', en: 'Concert-goers in … (city) and nearby' },
        problem: { no: 'Konsertkvelder konkurrerer med sofaen — gi folk en grunn til å komme', en: 'Show nights compete with the couch — give people a reason to come' },
        cta: { no: 'Kjøp billett nå', en: 'Get tickets now' },
      },
    },
    {
      key: 'demo',
      emoji: '🎧',
      label: { no: 'Demo / fra øvinga', en: 'Demo / from rehearsal' },
      hint: { no: 'Rått og ekte — ny låt under arbeid, ingen polering', en: 'Raw and real — new song in progress, no polish' },
      prefill: {
        title: { no: 'Fra øvinga: «…» (under arbeid)', en: 'From rehearsal: "…" (work in progress)' },
        topic: {
          no: 'Sniktitt fra øvingslokalet: vi jobber med en ny låt som heter «…». Den handler om … Rå versjon — si hva dere synes.',
          en: 'Sneak peek from rehearsal: we are working on a new song called "…". It is about … Rough version — tell us what you think.',
        },
        targetAudience: { no: 'Fansen som vil følge prosessen tett', en: 'Fans who want to follow the process up close' },
        problem: { no: 'Avstanden mellom artist og fans — det rå bygger nærhet det polerte ikke gjør', en: 'Distance between artist and fans — raw builds closeness polish cannot' },
        cta: { no: 'Følg oss for veien til ferdig låt', en: 'Follow us for the road to the finished track' },
      },
    },
    {
      key: 'other',
      emoji: '✨',
      label: { no: 'Noe annet', en: 'Something else' },
      hint: { no: 'Musikkvideo, merch, intervju — beskriv det selv', en: 'Music video, merch, interview — describe it yourself' },
      prefill: {
        title: { no: '…', en: '…' },
        topic: {
          no: 'Vi vil promotere: … Fortell hva det er, når det skjer, og hvorfor folk bør bry seg.',
          en: 'We want to promote: … Tell us what it is, when it happens, and why people should care.',
        },
        targetAudience: { no: '…', en: '…' },
        problem: { no: '', en: '' },
        cta: { no: '…', en: '…' },
      },
    },
    {
      key: 'band',
      emoji: '👋',
      label: { no: 'Bandpresentasjon', en: 'Meet the band' },
      hint: { no: 'Hvem er dere — for nye følgere og bookere', en: 'Who you are — for new followers and bookers' },
      prefill: {
        title: { no: 'Møt … (bandnavn)', en: 'Meet … (band name)' },
        topic: {
          no: 'Vi er … (bandnavn) fra … (by): … (medlemmer og instrumenter). Vi lager … (sjanger/beskrivelse). Startet i … Kjent for …',
          en: 'We are … (band name) from … (city): … (members and instruments). We make … (genre/description). Started in … Known for …',
        },
        targetAudience: { no: 'Nye lyttere, følgere og bookere', en: 'New listeners, followers and bookers' },
        problem: { no: 'Folk hører én låt men vet ikke hvem dere er — ansikt og historie gjør lyttere til fans', en: 'People hear one song but do not know who you are — a face and a story turn listeners into fans' },
        cta: { no: 'Følg oss og hør mer', en: 'Follow us and hear more' },
      },
    },
  ],
}

export function campaignTemplates(vertical: string | null | undefined): CampaignTemplate[] {
  return (vertical && CAMPAIGN_TEMPLATES[vertical]) || []
}

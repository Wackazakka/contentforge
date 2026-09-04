// Vertikal-registeret: strukturelle forskjeller per tenant-vertikal
// (tenants.vertical). Copy-forskjeller ligger IKKE her — de flettes inn via
// messages/verticals/{vertical}.{locale}.json i i18n.ts. Ny vertikal = én
// oppføring her + én meldingsfil per språk; null komponentendringer.

export interface VerticalCategoryOption {
  value: string // lagres i products.category
  labelKey: string // nøkkel i productModal-namespacet
}

export type ProductionType = 'video' | 'radio' | 'avatar' | 'article'

export interface VerticalConfig {
  categoryOptions: VerticalCategoryOption[]
  serviceAreaField: boolean // vis «Område»-felt (product_profiles.service_area)
  contactFields?: boolean // vis Nettside/Telefon/Adresse i registreringen (product_profiles)
  logoUpload?: boolean // vis logoopplasting i registreringen (to-fase via upload-logo)
  // «Enkel modus» (Standard Ropert, Lars 4/9): folk som saa vidt sender
  // e-post. Produktsiden erstattes av en firestegs filmflyt (sang → bilder →
  // se → del), navigasjonen krympes til Oversikt/Konto, og alt byraa-spraak
  // (merkevareprofil, taxameter, publiseringskanaler) holdes utenfor.
  simpleMode?: boolean
  // Hvilke produksjonstyper som tilbys. Utelatt = alle (som foer).
  productionTypes?: ProductionType[]
  // Merkevareprofilen (logo/farger/tone) paa produktsiden. Utelatt = vist.
  brandProfile?: boolean
}

export const VERTICALS: Record<string, VerticalConfig> = {
  // Bombaza: håndverkere som promoterer egen bedrift
  craftsman: {
    categoryOptions: [
      { value: 'rorlegger', labelKey: 'categoryRorlegger' },
      { value: 'elektriker', labelKey: 'categoryElektriker' },
      { value: 'snekker', labelKey: 'categorySnekker' },
      { value: 'maler', labelKey: 'categoryMaler' },
      { value: 'murer', labelKey: 'categoryMurer' },
      { value: 'taktekker', labelKey: 'categoryTaktekker' },
      { value: 'annet', labelKey: 'categoryAnnet' },
    ],
    serviceAreaField: true,
    contactFields: true,
    logoUpload: true,
  },
  // IndigoBoom: artister/band som promoterer egne slipp, konserter og seg selv.
  // «Produktet» er bandet; beskrivelsen er bioen; kategorien er sjangeren.
  music: {
    categoryOptions: [
      { value: 'pop', labelKey: 'categoryPop' },
      { value: 'rock', labelKey: 'categoryRock' },
      { value: 'hiphop', labelKey: 'categoryHiphop' },
      { value: 'elektronisk', labelKey: 'categoryElektronisk' },
      { value: 'country', labelKey: 'categoryCountry' },
      { value: 'jazz', labelKey: 'categoryJazz' },
      { value: 'metal', labelKey: 'categoryMetal' },
      { value: 'visesang', labelKey: 'categoryVisesang' },
      { value: 'annet', labelKey: 'categoryAnnet' },
    ],
    serviceAreaField: false,
    contactFields: true,
    logoUpload: true,
  },
  // Standard Ropert: folk (og bedrifter) med noe aa feire. «Produktet» er
  // anledningen; kategorien er anledningstypen. Ingen kontaktfelter/logo —
  // privatpersoner skal ikke moete bedriftsskjema.
  celebration: {
    categoryOptions: [
      { value: 'bursdag', labelKey: 'categoryBursdag' },
      { value: 'bryllup', labelKey: 'categoryBryllup' },
      { value: 'jubileum', labelKey: 'categoryJubileum' },
      { value: 'daap', labelKey: 'categoryDaap' },
      { value: 'konfirmasjon', labelKey: 'categoryKonfirmasjon' },
      { value: 'bedrift', labelKey: 'categoryBedrift' },
      { value: 'annet', labelKey: 'categoryAnnet' },
    ],
    serviceAreaField: false,
    contactFields: false,
    logoUpload: false,
    simpleMode: true,
    productionTypes: ['video'],
    brandProfile: false,
  },
}

export function verticalConfig(vertical: string | null | undefined): VerticalConfig | null {
  return (vertical && VERTICALS[vertical]) || null
}

export function isSimpleMode(vertical: string | null | undefined): boolean {
  return verticalConfig(vertical)?.simpleMode === true
}

// Tilbys denne produksjonstypen i vertikalen? Vertikaler uten liste faar alt.
export function offersProduction(vertical: string | null | undefined, type: ProductionType): boolean {
  const cfg = verticalConfig(vertical)
  if (!cfg || !cfg.productionTypes) return true
  return cfg.productionTypes.includes(type)
}

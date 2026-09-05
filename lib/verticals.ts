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
  // Fast pris per film i den enkle flyten (Lars 4/9): kunden betaler
  // customerPriceNok (inkl. mva) i Stripe; Norditechs engrospris til partneren
  // er wholesaleNok og logges som forbruk i stedet for maalt API-kost.
  film?: {
    customerPriceNok: number; wholesaleNok: number
    // Nivaa 2 (Lars 5/9): animerte bilder — hvert bilde blir et Kling-klipp
    // (~2 kr raakost per scene), derfor hoeyere engrospris
    animated?: { customerPriceNok: number; wholesaleNok: number }
  }
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
      // Livets anledninger foerst, saa sesongene Festmagasinet selger paa
      // (Lars 4/9) og Sangskapers egne (utdrikningslag, firmafest).
      { value: 'bursdag', labelKey: 'categoryBursdag' },
      { value: 'bryllup', labelKey: 'categoryBryllup' },
      { value: 'utdrikningslag', labelKey: 'categoryUtdrikningslag' },
      { value: 'jubileum', labelKey: 'categoryJubileum' },
      { value: 'daap', labelKey: 'categoryDaap' },
      { value: 'konfirmasjon', labelKey: 'categoryKonfirmasjon' },
      { value: 'krepselag', labelKey: 'categoryKrepselag' },
      { value: 'oktoberfest', labelKey: 'categoryOktoberfest' },
      { value: 'halloween', labelKey: 'categoryHalloween' },
      { value: 'julebord', labelKey: 'categoryJulebord' },
      { value: 'jul', labelKey: 'categoryJul' },
      { value: 'nyttaar', labelKey: 'categoryNyttaar' },
      { value: 'valentine', labelKey: 'categoryValentine' },
      { value: 'paaske', labelKey: 'categoryPaaske' },
      { value: 'syttendemai', labelKey: 'categorySyttendemai' },
      { value: 'firmafest', labelKey: 'categoryFirmafest' },
      { value: 'bedrift', labelKey: 'categoryBedrift' },
      { value: 'annet', labelKey: 'categoryAnnet' },
    ],
    serviceAreaField: false,
    contactFields: false,
    logoUpload: false,
    simpleMode: true,
    productionTypes: ['video'],
    brandProfile: false,
    film: { customerPriceNok: 149, wholesaleNok: 25, animated: { customerPriceNok: 249, wholesaleNok: 60 } },
  },
}

export function filmPricing(vertical: string | null | undefined) {
  return verticalConfig(vertical)?.film ?? null
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

// Vertikal-registeret: strukturelle forskjeller per tenant-vertikal
// (tenants.vertical). Copy-forskjeller ligger IKKE her — de flettes inn via
// messages/verticals/{vertical}.{locale}.json i i18n.ts. Ny vertikal = én
// oppføring her + én meldingsfil per språk; null komponentendringer.

export interface VerticalCategoryOption {
  value: string // lagres i products.category
  labelKey: string // nøkkel i productModal-namespacet
}

export interface VerticalConfig {
  categoryOptions: VerticalCategoryOption[]
  serviceAreaField: boolean // vis «Område»-felt (product_profiles.service_area)
  contactFields?: boolean // vis Nettside/Telefon/Adresse i registreringen (product_profiles)
  logoUpload?: boolean // vis logoopplasting i registreringen (to-fase via upload-logo)
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
}

export function verticalConfig(vertical: string | null | undefined): VerticalConfig | null {
  return (vertical && VERTICALS[vertical]) || null
}

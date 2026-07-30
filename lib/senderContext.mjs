// «Om avsenderen»-konteksten som gis til Claude i produksjonsprompter.
// Delt mellom app-ruta (produce/draft) og Netlify-funksjonen
// (generate-article-background) — var tidligere duplisert i begge.
// Ren ESM JS (ikke TS) slik at Netlify-funksjonenes esbuild kan bundle den.
//
// Etikettene er vertikal-bevisste: for music-vertikalen (IndigoBoom) er
// avsenderen en artist/band, ikke en bedrift — det endrer både feltnavn og
// tonen modellen skal skrive i.

/**
 * Slå opp tenant-vertikalen for et produkt via organisasjonen.
 * Defensiv: alle feil ⇒ null (konteksten er valgfri og skal aldri velte noe).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string | null | undefined} organizationId
 * @returns {Promise<string | null>}
 */
export async function fetchVerticalForOrganization(sb, organizationId) {
  if (!organizationId) return null
  try {
    const { data: org } = await sb.from('organizations').select('tenant_id').eq('id', organizationId).maybeSingle()
    if (!org?.tenant_id) return null
    const { data: tenant } = await sb.from('tenants').select('vertical').eq('id', org.tenant_id).maybeSingle()
    return tenant?.vertical || null
  } catch {
    return null
  }
}

/**
 * Bygg avsender-konteksten som legges i prompten.
 * @param {object} args
 * @param {{ name?: string, description?: string, category?: string } | null} args.product
 * @param {{ service_area?: string, phone?: string, address?: string, website_url?: string } | null} args.profile
 * @param {string | null} args.vertical  tenants.vertical (f.eks. 'music', 'craftsman')
 * @param {string} args.media  hva som produseres, f.eks. 'video' eller 'article'
 * @returns {string}
 */
export function buildSenderContext({ product, profile, vertical, media }) {
  const websiteUrl = profile?.website_url || null
  if (vertical === 'music') {
    return [
      product?.name ? `Sender (the artist/band this ${media} promotes): ${product.name}` : '',
      product?.description ? `About the artist/band: ${product.description}` : '',
      product?.category ? `Genre: ${product.category}` : '',
      profile?.address ? `Based in: ${profile.address}` : '',
      profile?.phone ? `Booking phone: ${profile.phone}` : '',
      websiteUrl ? `Artist website/links: ${websiteUrl}` : '',
      'The sender is a music artist/band promoting their own music and shows. ' +
        'Write fan-facing promo in the artist’s voice — not corporate marketing language.',
    ].filter(Boolean).join('\n')
  }
  // Default (craftsman og alle uten vertikal): bedriften bak innholdet.
  return [
    product?.name ? `Sender (the business/product this ${media} promotes): ${product.name}` : '',
    product?.description ? `About the sender: ${product.description}` : '',
    product?.category ? `Sender category/trade: ${product.category}` : '',
    profile?.service_area ? `Sender service area: ${profile.service_area}` : '',
    profile?.phone ? `Sender phone: ${profile.phone}` : '',
    profile?.address ? `Sender address: ${profile.address}` : '',
    websiteUrl ? `Sender website: ${websiteUrl}` : '',
  ].filter(Boolean).join('\n')
}

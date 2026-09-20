import type { MetadataRoute } from 'next'
import { getTenant, getTenantCanonicalOrigin, ROOT_TENANT } from '@/lib/tenantServer'
import { getPublicActors } from '@/lib/publicActors'

// sitemap.xml, per tenant (Lars 20.09.2026).
//
// 🔑 DET VIKTIGSTE HER ER VISITTKORTENE. Landingssiden finner en produsent
// uansett; det hen IKKE finner uten et sitemap, er den enkelte
// rettighetshaveren — og det er nettopp de sidene som gjør katalogen til en
// destinasjon. Hver ny publisert rettighetshaver kommer med av seg selv.
//
// ⚠️ EKSEMPELPROFILER HOLDES UTE. Et kort som ser ut som en ekte bookbar
// person, funnet via Google, er nøyaktig det vi ikke skal lage. De er merket
// på sida, men et søkeresultat viser ikke merket.
//
// Adressene bygges mot den KANONISKE origin, ikke verten forespørselen kom
// inn på: ellers ville twinledger.ai og twinledger.norditech.io levert hvert
// sitt sitemap med hver sin kopi av de samme sidene.

// ⚠️ ROTA ER ALLTID INDEKSERBAR. Den har sin egen gren i layouten (index:true)
// og hadde ingen robots.txt før denne fila — altså var den åpen. Uten dette
// unntaket ville denne fila DE-INDEKSERT CenterForge, som er det motsatte av
// hva oppgaven var.
function skalIndekseres(tenant: { slug?: string; allow_indexing?: boolean | null }): boolean {
  return tenant.slug === ROOT_TENANT.slug || tenant.allow_indexing === true
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tenant = await getTenant()
  if (!skalIndekseres(tenant)) return []

  const origin = await getTenantCanonicalOrigin(tenant)
  const naa = new Date()

  const sider: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: naa, changeFrequency: 'weekly', priority: 1 },
    { url: `${origin}/white-label`, lastModified: naa, changeFrequency: 'monthly', priority: 0.5 },
  ]

  // Katalogen og kortene finnes bare på tjenester med rettighetsforvaltning.
  if (tenant.twinledger_enabled !== false) {
    sider.push({ url: `${origin}/stemmer`, lastModified: naa, changeFrequency: 'daily', priority: 0.9 })
    // Rekrutteringssida — men bare når døra faktisk er åpen. Er den lukket,
    // viser den et avslag, og et søketreff som fører dit er verre enn ingen.
    if (tenant.accept_actor_applications === true) {
      sider.push({ url: `${origin}/bli-stemme`, lastModified: naa, changeFrequency: 'monthly', priority: 0.7 })
    }
    try {
      const actors = await getPublicActors(tenant)
      for (const a of actors) {
        if (a.isDemo) continue
        sider.push({
          url: `${origin}/stemme/${a.id}`,
          lastModified: naa,
          changeFrequency: 'weekly',
          priority: 0.8,
        })
      }
    } catch {
      // Et sitemap uten kortene er tynt, men et sitemap som feiler er verre:
      // da får søkemotoren ingenting i stedet for landingssiden.
    }
  }

  return sider
}

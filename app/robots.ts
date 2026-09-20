import type { MetadataRoute } from 'next'
import { getTenant, getTenantCanonicalOrigin, ROOT_TENANT } from '@/lib/tenantServer'

// robots.txt, per tenant (Lars 20.09.2026).
//
// Én site serverer alle tenantene, så denne fila må svare ULIKT per vert. En
// felles statisk /public/robots.txt ville enten åpnet white-labelene eller
// stengt destinasjonen.
//
// 🔑 ALLOW_INDEXING ER AV SOM STANDARD. Et byrå som selger i egen drakt skal
// ikke konkurrere med forvalteren på samme søk. Bryteren settes per tenant
// (085), ikke som et unntak i koden.
//
// Stiene under er stengt selv når indeksering er PÅ: de er enten innlogget,
// personlige, eller delt som lenke og ikke ment som søkeresultat. Å la dem
// ligge åpne ville satt en rettighetshavers hovedbok i søkeindeksen.
const STENGT = [
  '/api/',
  '/dashboard',
  '/min-stemme',      // rettighetshaverens egen hovedbok
  '/godkjenn/',       // magisk lenke fra e-post
  '/audition',        // koster penger, krever innlogging
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/start',
  '/for-deg/kreditt',
]

// ⚠️ ROTA ER ALLTID INDEKSERBAR. Den har sin egen gren i layouten (index:true)
// og hadde ingen robots.txt før denne fila — altså var den åpen. Uten dette
// unntaket ville denne fila DE-INDEKSERT CenterForge, som er det motsatte av
// hva oppgaven var.
function skalIndekseres(tenant: { slug?: string; allow_indexing?: boolean | null }): boolean {
  return tenant.slug === ROOT_TENANT.slug || tenant.allow_indexing === true
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const tenant = await getTenant()
  const origin = await getTenantCanonicalOrigin(tenant)

  if (!skalIndekseres(tenant)) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [{ userAgent: '*', allow: '/', disallow: STENGT }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  }
}

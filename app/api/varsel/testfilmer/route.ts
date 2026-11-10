import { NextResponse } from 'next/server'
import { cronVakt } from '@/lib/cronVakt'
import { admin } from '@/lib/velkomst'
import { startProductionForDraft } from '@/lib/production'
import { varsleProduksjon } from '@/lib/produksjonsvarsel'
import { TESTFILM_PRODUKT } from '@/lib/testfilmer'

// Starter de automatiske testfilmene (se lib/testfilmer.ts). Kalles hver natt
// av cron-testfilmer, og kan kalles for hånd etter en deploy av videomotoren.
// Selve oppfølgingen gjør produksjonsvakten (feiler/henger → varsel) og
// morgenoppsummeringen (ferdig/ikke ferdig).

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const stopp = cronVakt(request)
  if (stopp) return stopp

  const sb = admin()
  const { data: utkast, error } = await sb
    .from('production_drafts')
    .select('id, title, status')
    .eq('product_id', TESTFILM_PRODUKT)
    .like('title', 'TEST %')
    .order('title')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Testvideoer eldre enn 3 døgn fjernes fra biblioteket (R2-filene er billige
  // og får ligge) — ellers vokser produktet med fem filmer hver natt.
  const grense = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
  await sb.from('asset_banks').delete().eq('product_id', TESTFILM_PRODUKT).lt('created_at', grense)

  const resultat: Array<{ tittel: string; jobId?: string; feil?: string }> = []
  for (const d of utkast || []) {
    // En testfilm som fortsatt går fra forrige runde startes ikke på nytt
    if (d.status === 'processing') { resultat.push({ tittel: d.title, feil: 'går fortsatt fra forrige runde' }); continue }
    try {
      const { jobId } = await startProductionForDraft(d.id)
      resultat.push({ tittel: d.title, jobId })
    } catch (e: any) {
      const feil = e?.message || String(e)
      resultat.push({ tittel: d.title, feil })
      await varsleProduksjon({ type: 'film', productId: TESTFILM_PRODUKT, steg: `Testfilm kunne ikke startes: ${d.title}`, feil })
    }
  }
  console.log('[testfilmer]', JSON.stringify(resultat))
  return NextResponse.json({ startet: resultat.filter((r) => r.jobId).length, resultat })
}

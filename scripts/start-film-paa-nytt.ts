// Start en brukers film på nytt for dem, og registrer at VI gjorde det
// (film_hendelser 'startet_av_oss'), så morgenoppsummeringen skiller «klarte
// det selv» fra «fikk hjelp». Bruk alltid dette i stedet for å kalle
// startProductionForDraft direkte.
//
//   NEXT_PUBLIC_SUPABASE_URL=https://wxnevywhtmovangkobal.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/start-film-paa-nytt.ts <draftId> "<grunn>"
import { createClient } from '@supabase/supabase-js'
import { startProductionForDraft } from '../lib/production'

async function main() {
  const [draftId, grunn = ''] = process.argv.slice(2)
  if (!draftId) throw new Error('Bruk: start-film-paa-nytt.ts <draftId> "<grunn>"')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  const { data: d } = await sb.from('production_drafts').select('product_id, user_id, title').eq('id', draftId).single()
  const { jobId } = await startProductionForDraft(draftId)
  const { error } = await sb.from('film_hendelser').insert({
    type: 'startet_av_oss', job_id: jobId, product_id: d?.product_id || null, user_id: d?.user_id || null,
    meta: { draftId, tittel: d?.title || null, grunn },
  })
  if (error) console.warn('Startet, men ikke registrert i film_hendelser:', error.message)
  console.log('OK', jobId)
}
main().catch((e) => { console.error('FEIL', e.message); process.exit(1) })

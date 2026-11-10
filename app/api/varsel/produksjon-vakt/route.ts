import { NextResponse } from 'next/server'
import { cronVakt } from '@/lib/cronVakt'
import { admin } from '@/lib/velkomst'
import { varsleProduksjon } from '@/lib/produksjonsvarsel'

// Produksjonsvakt (Lars 10.11.2026: «det burde ikke være sånn at jeg må
// spørre»). Amys film 8.11: dropleten gikk tom for minne, systemd drepte HELE
// tjenesten, og dropletens egne varsler døde med den. Utkastet sto som
// «behandles» i to døgn før noen oppdaget det.
//
// Denne vakten kjører hos Netlify (cron-produksjonsvakt, hvert 10. min) —
// UAVHENGIG av dropleten. Den ser på databasen og spør dropleten om hver film
// som er under arbeid:
//   - dropleten svarer ikke              → varsel etter 30 min
//   - dropleten kjenner ikke jobben      → varsel etter 15 min (omstart/krasj)
//   - dropleten sier failed              → varsel med feilen
//   - fortsatt under arbeid etter 3 timer → varsel (henger)
// Varselet merker utkastet 'failed', så hver film varsles én gang og brukeren
// ser det på artistsiden. Film som allerede ligger i asset_banks hoppes over.

export const runtime = 'nodejs'

const DROPLET_URL = 'http://139.59.212.218:3002'
const MIN = 60 * 1000
const VINDU_DAGER = 3 // eldre «processing»-rader er historiske (før 'done' fantes)

// timestamp without time zone = UTC uten «Z»
const utc = (s: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z').getTime()

export async function POST(request: Request) {
  const stopp = cronVakt(request)
  if (stopp) return stopp

  const sb = admin()
  const fra = new Date(Date.now() - VINDU_DAGER * 24 * 60 * MIN).toISOString()
  const { data: utkast, error } = await sb
    .from('production_drafts')
    .select('id, job_id, updated_at')
    .eq('status', 'processing')
    .not('job_id', 'is', null)
    .gte('updated_at', fra)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const resultat: Array<{ jobId: string; alderMin: number; status: string; varslet?: boolean }> = []
  for (const d of utkast || []) {
    const jobId = String(d.job_id)
    const alder = Date.now() - utc(String(d.updated_at))
    if (alder < 15 * MIN) continue

    const { data: video } = await sb.from('asset_banks').select('id').eq('job_id', jobId).eq('asset_type', 'video').limit(1).maybeSingle()
    if (video) continue

    let status = 'svarer_ikke', feil = ''
    try {
      const r = await fetch(`${DROPLET_URL}/jobs/${jobId}`, { signal: AbortSignal.timeout(10000) })
      const j = await r.json()
      status = String(j?.status || 'ukjent')
      feil = j?.error ? String(j.error) : ''
    } catch (e: any) {
      feil = e?.message || String(e)
    }

    const alderMin = Math.round(alder / MIN)
    let varsel: { steg: string; feil: string } | null = null
    if (status === 'svarer_ikke' && alder > 30 * MIN) {
      varsel = { steg: 'Renderserveren svarer ikke', feil: `Dropleten har ikke svart på ${alderMin} min (${feil}). Filmen er trolig stoppet.` }
    } else if (status === 'not_found') {
      varsel = { steg: 'Jobben forsvant', feil: `Dropleten kjenner ikke jobben ${alderMin} min etter start — tjenesten har trolig startet på nytt (krasj eller tomt for minne) midt i produksjonen.` }
    } else if (status === 'failed' || status === 'error') {
      varsel = { steg: 'Feilet på dropleten', feil: feil || 'ingen feilmelding' }
    } else if (status !== 'done' && alder > 3 * 60 * MIN) {
      varsel = { steg: 'Henger', feil: `Fortsatt «${status}» ${alderMin} min etter start.` }
    }

    let varslet = false
    if (varsel) {
      const r = await varsleProduksjon({ type: 'film', jobId, steg: `Produksjonsvakt: ${varsel.steg}`, feil: varsel.feil })
      varslet = r.ok
    }
    resultat.push({ jobId, alderMin, status, varslet })
  }

  console.log('[produksjon-vakt]', JSON.stringify(resultat))
  return NextResponse.json({ sjekket: resultat.length, resultat })
}

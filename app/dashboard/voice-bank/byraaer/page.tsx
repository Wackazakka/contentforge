'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'

// Byråene og påmeldingslenkene deres (097/116, 25.10.2026).
//
// 🔑 LENKEN ER EN GARANTI FRA BYRÅET. Den som melder seg på gjennom den, regnes
// som bekreftet av byrået og kan publiseres uten BankID. Byrået får en e-post
// for hver påmelding, med «Ikke vår klient». Derfor kreves e-postadressen.
//
// «Ny lenke» gjør den gamle ugyldig — for en lenke som har lekket. Å slå av et
// byrå stopper nye påmeldinger; de som alt er inne, beholder bekreftelsen.

interface Byraa {
  id: string; name: string; contactEmail: string | null; orgNr: string | null
  defaultCommissionPct: number | null; note: string | null; isActive: boolean
  createdAt: string; link: string | null; actors: number
}

export default function ByraaerPage() {
  const t = useTranslations('agencies')
  const [rader, setRader] = useState<Byraa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [kopiert, setKopiert] = useState<string | null>(null)
  const [ny, setNy] = useState({ name: '', contactEmail: '', orgNr: '', defaultCommissionPct: '' })

  const authedFetch = async (init?: RequestInit) => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error(t('err_login'))
    return fetch('/api/voice-bank/agents', { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  }

  // Ingen setState før første await: effekten under kaller denne, og en
  // synkron setState i en effekt gir en ekstra runde med rendring.
  const kall = async (init?: RequestInit) => {
    const res = await authedFetch(init)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || t('err_generic'))
    setError(null)
    setRader(d.agents || [])
  }

  // Samme mønster som utbetalingslisten: «loading» starter som true og skrus
  // bare av her, etter svaret.
  const hent = async () => {
    try { await kall() } catch (e) { setError(e instanceof Error ? e.message : t('err_generic')) } finally { setLoading(false) }
  }
  useEffect(() => { hent() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const lagNy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ny.name.trim()) { setError(t('err_name')); return }
    if (!ny.contactEmail.includes('@')) { setError(t('err_email')); return }
    setBusy(true)
    try {
      await kall({ method: 'POST', body: JSON.stringify(ny) })
      setNy({ name: '', contactEmail: '', orgNr: '', defaultCommissionPct: '' })
    } catch (err) { setError(err instanceof Error ? err.message : t('err_generic')) } finally { setBusy(false) }
  }

  const endre = async (body: Record<string, unknown>, sporsmaal?: string) => {
    if (sporsmaal && !window.confirm(sporsmaal)) return
    setBusy(true)
    try { await kall({ method: 'PATCH', body: JSON.stringify(body) }) }
    catch (err) { setError(err instanceof Error ? err.message : t('err_generic')) } finally { setBusy(false) }
  }

  const kopier = async (r: Byraa) => {
    if (!r.link) return
    try { await navigator.clipboard.writeText(r.link); setKopiert(r.id); setTimeout(() => setKopiert(null), 2000) } catch { /* viser lenken uansett */ }
  }

  const felt = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm'

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/dashboard/voice-bank" className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">{t('back')}</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('h1')}</h1>
        <p className="text-gray-600 mb-6 max-w-2xl">{t('intro')}</p>

        {loading && <p className="text-gray-500">{t('loading')}</p>}
        {error && <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

        {!loading && rader.length === 0 && !error && (
          <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 text-sm text-gray-600 mb-6">{t('none')}</div>
        )}

        <div className="space-y-3 mb-10">
          {rader.map((r) => (
            <div key={r.id} className={`bg-[var(--paper-raised)] rounded-lg border p-5 ${r.isActive ? 'border-gray-200' : 'border-gray-200 opacity-70'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-gray-900">{r.name}{!r.isActive && <span className="ml-2 text-xs font-normal text-gray-500">{t('inactive')}</span>}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {r.contactEmail || '—'}{r.orgNr ? ` · ${t('org_nr')} ${r.orgNr}` : ''}
                    {r.defaultCommissionPct != null ? ` · ${t('commission', { pct: String(r.defaultCommissionPct).replace('.', ',') })}` : ''}
                    {' · '}{t(r.actors === 1 ? 'actors_one' : 'actors_many', { n: r.actors })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.isActive && (
                    <button disabled={busy} onClick={() => endre({ id: r.id, action: 'rotate' }, t('rotate_confirm', { name: r.name }))}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:border-[var(--ember-deep)] disabled:opacity-40">
                      {t('rotate')}
                    </button>
                  )}
                  <button disabled={busy} onClick={() => endre({ id: r.id, isActive: !r.isActive }, r.isActive ? t('deactivate_confirm', { name: r.name }) : undefined)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:border-[var(--ember-deep)] disabled:opacity-40">
                    {r.isActive ? t('deactivate') : t('activate')}
                  </button>
                </div>
              </div>
              {r.link && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="text-xs bg-[var(--paper)] border border-gray-200 rounded px-2 py-1 break-all select-all">{r.link}</code>
                  <button onClick={() => kopier(r)} className="text-xs px-3 py-1 rounded-lg bg-[var(--ink)] text-[var(--paper)] font-semibold">
                    {kopiert === r.id ? t('copied') : t('copy')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <h2 className="font-semibold text-gray-900 mb-3">{t('new_h2')}</h2>
        <form onSubmit={lagNy} className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-gray-700">{t('f_name')}
            <input value={ny.name} onChange={(e) => setNy({ ...ny, name: e.target.value })} className={`${felt} mt-1`} />
          </label>
          <label className="text-sm text-gray-700">{t('f_email')}
            <input type="email" value={ny.contactEmail} onChange={(e) => setNy({ ...ny, contactEmail: e.target.value })} className={`${felt} mt-1`} />
            <span className="block text-xs text-gray-500 mt-1">{t('f_email_hint')}</span>
          </label>
          <label className="text-sm text-gray-700">{t('f_org_nr')}
            <input value={ny.orgNr} onChange={(e) => setNy({ ...ny, orgNr: e.target.value })} className={`${felt} mt-1`} />
          </label>
          <label className="text-sm text-gray-700">{t('f_commission')}
            <input inputMode="decimal" value={ny.defaultCommissionPct} onChange={(e) => setNy({ ...ny, defaultCommissionPct: e.target.value })} className={`${felt} mt-1`} placeholder="15" />
            <span className="block text-xs text-gray-500 mt-1">{t('f_commission_hint')}</span>
          </label>
          <div className="sm:col-span-2">
            <button disabled={busy} className="px-5 py-2.5 rounded-lg font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:bg-[var(--ink)] disabled:opacity-50">
              {t('create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

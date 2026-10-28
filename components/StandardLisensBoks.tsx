'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'

// Standardlisensen på skuespillerkortet (128, 28.10.2026).
//
// Hva rettighetshaveren forhåndsgodkjenner: hva (stemme, ansikt, begge),
// medium, område og lengste periode. Kunden får lisensen med en gang til
// takstkortets pris når valget ligger innenfor. Plattformens grenser står fast
// og vises ikke som valg: aldri kjente navn, verk, eksklusivitet eller lisens
// uten sluttdato.

type Vilkaar = { enabled: boolean; assets: string[]; media: string[]; territories: string[]; maxTermMonths: number }
type Kort = { saved?: boolean; terms?: Vilkaar; blocker?: string | null; example?: { priceNok: number | null } | null; notEnabled?: boolean }

const ASSETS = ['voice', 'face', 'both']
const MEDIA = ['internal', 'online', 'broadcast']
const OMRAADER = ['no', 'nordic', 'world']

export default function StandardLisensBoks({ actorId }: { actorId: string }) {
  const t = useTranslations('actorAdmin')
  const [kort, setKort] = useState<Kort | null>(null)
  const [v, setV] = useState<Vilkaar | null>(null)
  const [busy, setBusy] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [lagret, setLagret] = useState(false)

  const kall = useCallback(async (init?: RequestInit) => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error('Ikke innlogget')
    const res = await fetch(`/api/voice-bank/standard-terms${init ? '' : `?actorId=${encodeURIComponent(actorId)}`}`, {
      ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || t('std_err'))
    return d as Kort
  }, [actorId, t])

  useEffect(() => {
    let avbrutt = false
    kall().then((d) => { if (!avbrutt) { setKort(d); setV(d.terms ?? null) } }).catch((e) => { if (!avbrutt) setFeil(e.message) })
    return () => { avbrutt = true }
  }, [kall])

  if (!kort && !feil) return null
  if (kort?.notEnabled) {
    return (
      <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-1">{t('std_h')}</h2>
        <p className="text-sm text-amber-700">{t('std_not_enabled')}</p>
      </div>
    )
  }

  const veksle = (felt: 'assets' | 'media' | 'territories', verdi: string) => {
    if (!v) return
    const naa = v[felt]
    setV({ ...v, [felt]: naa.includes(verdi) ? naa.filter((x) => x !== verdi) : [...naa, verdi] })
    setLagret(false)
  }

  const lagre = async (neste?: Vilkaar) => {
    const ny = neste ?? v
    if (!ny) return
    setBusy(true); setFeil(null); setLagret(false)
    try {
      const d = await kall({ method: 'PUT', body: JSON.stringify({ actorId, ...ny }) })
      setKort(d); setV(d.terms ?? ny); setLagret(true)
    } catch (e) { setFeil(e instanceof Error ? e.message : t('std_err')) } finally { setBusy(false) }
  }

  // En hjelpefunksjon, ikke en komponent: en komponent laget under rendring
  // monteres på nytt hver gang og mister fokus.
  const valg = (felt: 'assets' | 'media' | 'territories', verdier: string[], prefiks: string) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {verdier.map((x) => (
        <label key={x} className="flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={!!v?.[felt].includes(x)} disabled={busy} onChange={() => veksle(felt, x)} />
          {t(`${prefiks}_${x}`)}
        </label>
      ))}
    </div>
  )

  return (
    <div className="bg-[var(--paper-raised)] rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="font-semibold text-gray-900 mb-1">{t('std_h')}</h2>
      <p className="text-sm text-gray-600 mb-4 max-w-2xl">{t('std_intro')}</p>
      {feil && <p className="mb-3 text-sm text-red-700">{feil}</p>}
      {kort?.blocker && <p className="mb-3 text-sm text-amber-700">{kort.blocker}</p>}

      {v && (<>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-800 mb-4">
          <input type="checkbox" checked={v.enabled} disabled={busy || (!!kort?.blocker && !v.enabled)}
            onChange={(e) => { const ny = { ...v, enabled: e.target.checked }; setV(ny); lagre(ny) }} />
          {t('std_enabled')}
        </label>

        <div className="grid gap-3 max-w-2xl">
          <div><p className="text-xs text-gray-500 mb-1">{t('std_what')}</p>{valg('assets', ASSETS, 'std_asset')}</div>
          <div><p className="text-xs text-gray-500 mb-1">{t('std_media')}</p>{valg('media', MEDIA, 'std_media')}</div>
          <div><p className="text-xs text-gray-500 mb-1">{t('std_where')}</p>{valg('territories', OMRAADER, 'std_terr')}</div>
          <div>
            <p className="text-xs text-gray-500 mb-1">{t('std_term')}</p>
            <select value={v.maxTermMonths} disabled={busy} onChange={(e) => { setV({ ...v, maxTermMonths: Number(e.target.value) }); setLagret(false) }}
              className="px-2 py-1 border border-gray-300 rounded text-sm bg-[var(--paper)]">
              <option value={3}>{t('std_term_3')}</option>
              <option value={12}>{t('std_term_12')}</option>
            </select>
          </div>
          <p className="text-xs text-gray-500">{t('std_never')}</p>
          {kort?.example?.priceNok != null && <p className="text-xs text-gray-600">{t('std_example', { sum: kort.example.priceNok.toLocaleString('nb-NO') })}</p>}
          <div className="flex items-center gap-3">
            <button type="button" disabled={busy} onClick={() => lagre()}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] disabled:opacity-50">
              {t('std_save')}
            </button>
            {lagret && <span className="text-xs text-green-700">{t('std_saved')}</span>}
          </div>
        </div>
      </>)}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getSupabase } from '@/lib/supabaseClient'

// API-nøkler for asset-gatewayen: én nøkkel per kunde-organisasjon. Lar kundens
// egne verktøy bruke skuespillerstemmene via vårt API — all bruk logges og
// faktureres. Nøkkelen vises i klartekst kun ved opprettelse.

interface Org { id: string; name: string; tenant_id: string }
interface Key { id: string; key_prefix: string; organization_id: string; scopes: string[]; status: string; last_used_at: string | null; created_at: string }

export default function ApiKeysPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [keys, setKeys] = useState<Key[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [freshKey, setFreshKey] = useState<{ org: string; key: string } | null>(null)

  const authedFetch = async (init?: RequestInit) => {
    const { data: sess } = await getSupabase().auth.getSession()
    const token = sess?.session?.access_token
    if (!token) throw new Error('Ikke innlogget')
    return fetch('/api/gateway-keys', {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  }

  const refresh = async () => {
    try {
      const res = await authedFetch()
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Kunne ikke hente nøklene'); return }
      setError(null)
      setOrgs(data.organizations || [])
      setKeys(data.keys || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const createKey = async (org: Org) => {
    setBusy(org.id); setFreshKey(null); setError(null)
    try {
      const res = await authedFetch({ method: 'POST', body: JSON.stringify({ organizationId: org.id }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunne ikke opprette nøkkel')
      setFreshKey({ org: org.name, key: data.key })
      await refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  const setStatus = async (k: Key, status: string) => {
    setBusy(k.id)
    try {
      const res = await authedFetch({ method: 'PATCH', body: JSON.stringify({ keyId: k.id, status }) })
      if (res.ok) await refresh()
    } catch { /* behold visning */ } finally {
      setBusy(null)
    }
  }

  const keysFor = (orgId: string) => keys.filter((k) => k.organization_id === orgId)

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="text-[var(--ember-deep)] hover:text-[var(--ink)] mb-4 inline-block">← Tilbake</Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">🔑 API-nøkler</h1>
        <p className="text-gray-600 mb-8">
          Én nøkkel per kunde lar deres egne verktøy bruke skuespillerstemmene via vårt API — all bruk logges og
          faktureres, og stemmen kan ikke lastes ned. Nøkkelen vises kun én gang; oppbevar den trygt.
        </p>

        {loading && <p className="text-gray-500">Henter …</p>}
        {error && <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

        {freshKey && (
          <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200">
            <p className="text-sm font-semibold text-green-800 mb-1">Ny nøkkel for {freshKey.org} — kopier den nå:</p>
            <code className="block bg-[var(--paper-raised)] border border-green-200 rounded px-3 py-2 text-sm font-mono break-all">{freshKey.key}</code>
            <p className="text-xs text-green-700 mt-1">Denne vises aldri igjen. Send den til kunden via en sikker kanal.</p>
          </div>
        )}

        {!loading && orgs.length === 0 && !error && (
          <p className="text-sm text-gray-500">Ingen kunde-organisasjoner i ditt subtre ennå.</p>
        )}

        <div className="space-y-4">
          {orgs.map((org) => {
            const orgKeys = keysFor(org.id)
            return (
              <div key={org.id} className="bg-[var(--paper-raised)] rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <h2 className="font-semibold text-gray-900">{org.name}</h2>
                  <button onClick={() => createKey(org)} disabled={busy === org.id}
                    className="flex-none px-4 py-2 rounded-lg text-sm font-semibold text-[var(--on-ember)] bg-[var(--ember-deep)] hover:opacity-90 disabled:opacity-50 transition-opacity">
                    {busy === org.id ? 'Oppretter …' : '+ Ny nøkkel'}
                  </button>
                </div>
                {orgKeys.length === 0 ? (
                  <p className="text-sm text-gray-400">Ingen nøkler.</p>
                ) : (
                  <div className="space-y-2">
                    {orgKeys.map((k) => (
                      <div key={k.id} className="flex items-center justify-between gap-3 text-sm border-t border-gray-100 pt-2">
                        <div>
                          <code className="font-mono text-gray-700">{k.key_prefix}…</code>
                          <span className={`ml-3 ${k.status === 'active' ? 'text-green-700' : 'text-gray-400'}`}>
                            {k.status === 'active' ? 'Aktiv' : 'Tilbakekalt'}
                          </span>
                          <span className="ml-3 text-gray-400">{k.last_used_at ? `sist brukt ${new Date(k.last_used_at).toLocaleDateString('nb-NO')}` : 'aldri brukt'}</span>
                        </div>
                        <button onClick={() => setStatus(k, k.status === 'active' ? 'revoked' : 'active')} disabled={busy === k.id}
                          className={`flex-none px-3 py-1.5 rounded-lg font-medium border ${k.status === 'active' ? 'border-red-300 text-red-600 hover:bg-red-50' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                          {k.status === 'active' ? 'Tilbakekall' : 'Aktiver igjen'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

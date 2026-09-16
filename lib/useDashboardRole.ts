'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/authContext'

// Hvem er den innloggede på DETTE domenet? Tre roller som kan overlappe:
//   admin    — tenant-admin (avgjøres server-side av /api/voice-bank/admin)
//   actor    — rettighetshaver med forvaltningsavtale i denne banken
//   customer — har produsert noe eller kjøpt kreditt her
// «actorOnly» er den rene rettighetshaveren: hun skal se hovedboken sin og
// kontoen sin, ikke produksjonsdashbordet (Lars 16/9). Én kilde for både
// menyen og landingen, så de to aldri spriker.
export interface DashboardRole {
  loaded: boolean
  admin: boolean
  actor: boolean
  customer: boolean
  actorOnly: boolean
}

type Fetched = { token: string; admin: boolean; actor: boolean; customer: boolean }

export function useDashboardRole(): DashboardRole {
  const { session, loading } = useAuth()
  const token = session?.access_token ?? null
  // Svaret huskes sammen med tokenet det gjelder for; «loaded» avledes av om
  // de to stemmer overens. Ingen setState i effektkroppen, ingen mellomtilstand.
  const [fetched, setFetched] = useState<Fetched | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const h = { headers: { Authorization: `Bearer ${token}` } }
    Promise.all([
      fetch('/api/voice-bank/admin', h).then((r) => r.ok).catch(() => false),
      fetch('/api/voice-bank/me', h)
        .then(async (r) => (r.ok ? await r.json() : null))
        .catch(() => null),
    ]).then(([admin, me]) => {
      if (cancelled) return
      const actor = !!me && Array.isArray(me.actors) && me.actors.length > 0
      // Uten svar fra /me: oppfør deg som før (kunde). Feil skal aldri låse
      // en kunde ute av dashbordet sitt.
      const customer = !me || me.isCustomer !== false
      setFetched({ token, admin, actor, customer })
    })
    return () => { cancelled = true }
  }, [token])

  if (!token) {
    // Utlogget: ingenting å slå opp — ferdig så snart auth vet det.
    return { loaded: !loading, admin: false, actor: false, customer: true, actorOnly: false }
  }
  const current = fetched && fetched.token === token ? fetched : null
  if (!current) return { loaded: false, admin: false, actor: false, customer: true, actorOnly: false }
  return {
    loaded: true,
    admin: current.admin,
    actor: current.actor,
    customer: current.customer,
    actorOnly: current.actor && !current.admin && !current.customer,
  }
}

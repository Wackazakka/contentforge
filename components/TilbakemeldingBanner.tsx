'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getSupabase } from '@/lib/supabaseClient'

// Banner til tilbakemeldingsskjemaet (migrasjon 108). Ligger i dashbord-
// oppsettet, ikke på dashbordet: med én artist sendes man rett til
// artistsiden, så et dashbord-banner ville aldri vist seg. Vises bare for
// inviterte testere, og bare til de har svart (eller fått bonusen).
// Saldoen hentes på nytt når fanen får fokus igjen — i editoren synker den.

type Status = {
  aktiv: boolean
  saldoKreditter: number | null
  sistSendt: string | null
  bonus: { tilbys: boolean; gitt: boolean; fristUte: boolean; grense: number; kreditter: number; fristTekst: string }
}

export default function TilbakemeldingBanner() {
  const sti = usePathname()
  const [s, setS] = useState<Status | null>(null)

  useEffect(() => {
    let avbrutt = false
    const hent = async () => {
      try {
        const token = (await getSupabase().auth.getSession()).data?.session?.access_token
        if (!token) return
        const d = await fetch('/api/tilbakemelding', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
        if (!avbrutt && d?.aktiv) setS(d)
      } catch { /* banneret er valgfritt */ }
    }
    hent()
    const synlig = () => { if (document.visibilityState === 'visible') hent() }
    document.addEventListener('visibilitychange', synlig)
    return () => { avbrutt = true; document.removeEventListener('visibilitychange', synlig) }
  }, [sti])

  if (!s?.bonus?.tilbys || s.bonus.gitt) return null
  if (s.sistSendt && (s.bonus.fristUte || (s.saldoKreditter ?? 0) >= s.bonus.grense)) return null

  const k = (n: number) => Math.round(n).toLocaleString('nb-NO')
  const lav = s.saldoKreditter !== null && s.saldoKreditter < s.bonus.grense
  const tekst = s.bonus.fristUte
    ? 'Fortell oss hvordan det gikk – 11 korte spørsmål.'
    : lav
      ? `Du har ${k(s.saldoKreditter!)} kreditter igjen. Svar på 11 korte spørsmål, så får du ${k(s.bonus.kreditter)} nye med en gang.`
      : `Fortell oss hvordan det går – 11 korte spørsmål. Har du under ${k(s.bonus.grense)} kreditter igjen når du svarer, får du ${k(s.bonus.kreditter)} nye (til og med ${s.bonus.fristTekst}).`

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', justifyContent: 'space-between',
        marginBottom: 24, padding: '12px 16px', borderRadius: 12,
        background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border, transparent)',
        fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink)',
      }}
    >
      <span>🎁 {tekst}</span>
      <Link href="/tilbakemelding" style={{ fontWeight: 700, color: 'var(--ember-deep)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
        Gå til skjemaet →
      </Link>
    </div>
  )
}

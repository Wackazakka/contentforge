'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { getSupabase } from '@/lib/supabaseClient'

// Passordbytte for INNLOGGEDE (Lars 3/8). Fantes ikke fra før: den eneste
// veien til et nytt passord gikk gjennom «glemt passord»-e-posten, og
// Supabase lar deg sette passord når en bruker OPPRETTES, men ikke endre det
// etterpå. Fikk noen et passord av en annen, var de låst til det.
//
// Det gamle passordet kreves. Supabase godtar bytte på en aktiv økt alene,
// men da ville en forlatt, innlogget fane være nok til å overta kontoen.

export default function KontoPage() {
  const t = useTranslations('account')
  const [epost, setEpost] = useState<string | null>(null)
  const [gammelt, setGammelt] = useState('')
  const [nytt, setNytt] = useState('')
  const [bekreft, setBekreft] = useState('')
  const [jobber, setJobber] = useState(false)
  const [feil, setFeil] = useState<string | null>(null)
  const [ferdig, setFerdig] = useState(false)

  useEffect(() => {
    getSupabase().auth.getUser().then((res: any) => setEpost(res?.data?.user?.email ?? null))
  }, [])

  const lagre = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeil(null); setFerdig(false)
    if (nytt.length < 8) { setFeil(t('tooShort')); return }
    if (nytt !== bekreft) { setFeil(t('noMatch')); return }
    if (!epost) { setFeil(t('notSignedIn')); return }
    setJobber(true)
    try {
      // Verifiser det gamle passordet ved å logge inn på nytt med det
      const { error: innlogg } = await getSupabase().auth.signInWithPassword({ email: epost, password: gammelt })
      if (innlogg) { setFeil(t('wrongCurrent')); setJobber(false); return }
      const { error } = await getSupabase().auth.updateUser({ password: nytt })
      if (error) { setFeil(error.message); setJobber(false); return }
      setFerdig(true)
      setGammelt(''); setNytt(''); setBekreft('')
    } catch {
      setFeil(t('failed'))
    } finally {
      setJobber(false)
    }
  }

  const felt = 'w-full px-3 py-2 rounded-lg border border-[var(--ds-border-strong)] bg-[var(--paper)] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--ember-deep)]'

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-lg mx-auto px-4 sm:px-8 py-10">
        <Link href="/dashboard" className="text-[13px] text-[var(--text-muted)] hover:text-[var(--ink)]">
          {t('back')}
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-[var(--ink)]">{t('title')}</h1>
        {epost && <p className="mt-1 text-[14px] text-[var(--text-muted)]">{epost}</p>}

        <form onSubmit={lagre} className="mt-6 rounded-2xl border border-[var(--ds-border)] bg-[var(--paper-raised)] px-5 py-5 space-y-4">
          <h2 className="text-base font-semibold text-[var(--ink)]">{t('changePassword')}</h2>

          <div>
            <label className="block text-sm text-[var(--text-muted)] mb-1">{t('current')}</label>
            <input type="password" value={gammelt} onChange={(e) => setGammelt(e.target.value)} autoComplete="current-password" className={felt} />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-muted)] mb-1">{t('new')}</label>
            <input type="password" value={nytt} onChange={(e) => setNytt(e.target.value)} autoComplete="new-password" className={felt} />
            <p className="mt-1 text-[12px] text-[var(--text-faint)]">{t('rule')}</p>
          </div>
          <div>
            <label className="block text-sm text-[var(--text-muted)] mb-1">{t('confirm')}</label>
            <input type="password" value={bekreft} onChange={(e) => setBekreft(e.target.value)} autoComplete="new-password" className={felt} />
          </div>

          {feil && <p className="text-[13px] text-red-600">{feil}</p>}
          {ferdig && <p className="text-[13px] text-green-700">{t('saved')}</p>}

          <button
            type="submit"
            disabled={jobber || !gammelt || !nytt || !bekreft}
            className={`w-full px-4 py-2.5 rounded-lg font-medium ${
              jobber || !gammelt || !nytt || !bekreft
                ? 'bg-transparent text-[var(--ink)] border border-[var(--ds-border-strong)] cursor-default'
                : 'bg-[var(--ember-deep)] text-[var(--on-ember)]'
            }`}
          >
            {jobber ? t('saving') : t('save')}
          </button>
        </form>
      </div>
    </div>
  )
}

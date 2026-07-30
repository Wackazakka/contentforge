'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/authContext'
import { PLANS, PlanKey } from '@/lib/stripe'
import { useTranslations } from 'next-intl'

const HANKEN = 'var(--font-hanken), sans-serif'
const SERIF = 'var(--font-serif), serif'

interface Subscription {
  plan: PlanKey
  status: string
  current_period_end: string | null
}

interface Transaction {
  id: string
  type: string
  amount: number
  description: string
  created_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function BillingPage() {
  const { session } = useAuth()
  const t = useTranslations('billing')
  const userId = session?.user?.id

  const [balance, setBalance] = useState<number | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    if (!userId) return
    const load = async () => {
      try {
        const [creditsRes, txRes] = await Promise.all([
          fetch(`/api/credits?userId=${userId}`),
          fetch(`/api/credits/transactions?userId=${userId}`),
        ])
        const creditsData = await creditsRes.json()
        const txData = await txRes.json()
        setBalance(creditsData.balance ?? 0)
        setSubscription(creditsData.subscription ?? null)
        setTransactions(txData.transactions ?? [])
      } catch (err) {
        console.error('[billing] load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  const handleManage = async () => {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch (err) {
      console.error('[billing] portal error:', err)
    } finally {
      setPortalLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div style={{ fontFamily: HANKEN, color: 'var(--text-faint)' }}>{t('loading')}</div>
      </div>
    )
  }

  const planConfig = subscription?.plan ? PLANS[subscription.plan] : null
  const eyebrow: React.CSSProperties = { fontFamily: 'var(--font-cfmono), monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '0 0 16px' }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 className="cf-h1" style={{ marginBottom: 28 }}>{t('title')}</h1>

      {/* Current plan */}
      <div className="cf-panel" style={{ padding: 28, marginBottom: 18 }}>
        <p style={eyebrow}>{t('currentPlan')}</p>
        {planConfig && subscription ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontFamily: HANKEN, fontWeight: 700, fontSize: 24, color: 'var(--ink)', margin: '0 0 6px' }}>{planConfig.name}</p>
              <p style={{ fontFamily: HANKEN, fontSize: 14, color: 'var(--text-muted)', margin: '0 0 3px' }}>
                {t('status')}:{' '}
                <span style={{ color: subscription.status === 'active' ? '#3F7A4E' : 'var(--ember-deep)', fontWeight: 600 }}>
                  {subscription.status}
                </span>
              </p>
              {subscription.current_period_end && (
                <p style={{ fontFamily: HANKEN, fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
                  {t('renews', { date: formatDate(subscription.current_period_end) })}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontFamily: SERIF, fontSize: 42, lineHeight: 1, color: 'var(--ink)' }}>${planConfig.price}</span>
              <span style={{ fontFamily: HANKEN, fontSize: 15, color: 'var(--text-faint)' }}>/mo</span>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontFamily: HANKEN, fontSize: 15, color: 'var(--text-muted)', margin: '0 0 14px' }}>{t('noSubscription')}</p>
            <a
              href="/pricing"
              className="cf-btn-ink"
              style={{ display: 'inline-block', fontFamily: HANKEN, fontWeight: 700, fontSize: 15, color: 'var(--paper)', background: 'var(--ink)', borderRadius: 999, padding: '11px 22px', textDecoration: 'none' }}
            >
              {t('viewPlans')}
            </a>
          </div>
        )}

        {planConfig && (
          <>
            <div style={{ height: 1, background: 'var(--ds-border)', margin: '22px 0' }} />
            <button
              onClick={handleManage}
              disabled={portalLoading}
              className="cf-btn-ghost"
              style={{ width: '100%', fontFamily: HANKEN, fontWeight: 700, fontSize: 15, color: 'var(--ink)', background: 'transparent', border: '1px solid #D2C7B2', borderRadius: 11, padding: 13, cursor: portalLoading ? 'not-allowed' : 'pointer', opacity: portalLoading ? 0.5 : 1 }}
            >
              {portalLoading ? t('opening') : t('manageSubscription')}
            </button>
          </>
        )}
      </div>

      {/* Credits */}
      <div className="cf-panel" style={{ padding: 28, marginBottom: 18 }}>
        <p style={eyebrow}>{t('creditsTitle')}</p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 20 }}>
          <span style={{ fontFamily: SERIF, fontSize: 52, lineHeight: 1, color: 'var(--ember)' }}>{balance ?? 0}</span>
          <span style={{ fontFamily: HANKEN, fontSize: 16, color: 'var(--text-muted)' }}>{t('creditsRemaining')}</span>
        </div>
        {planConfig && (
          <div style={{ background: 'var(--ember-tint-bg)', border: '1px solid var(--ember-tint-border)', borderRadius: 13, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
              <span style={{ fontFamily: HANKEN, fontSize: 14.5, color: 'var(--ink-soft)' }}>{t('videoProduction')}</span>
              <span style={{ fontFamily: HANKEN, fontSize: 14.5, fontWeight: 700, color: 'var(--ember-deep)' }}>{t('creditCost10')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
              <span style={{ fontFamily: HANKEN, fontSize: 14.5, color: 'var(--ink-soft)' }}>{t('articleGeneration')}</span>
              <span style={{ fontFamily: HANKEN, fontSize: 14.5, fontWeight: 700, color: 'var(--ember-deep)' }}>{t('creditCost1')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Transaction history */}
      {transactions.length > 0 && (
        <div className="cf-panel" style={{ padding: 28 }}>
          <p style={eyebrow}>{t('transactionHistory')}</p>
          <div>
            {transactions.map((tx) => (
              <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderBottom: '1px solid var(--ds-border-faint)' }}>
                <div>
                  <p style={{ fontFamily: HANKEN, fontSize: 15, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{tx.description}</p>
                  <p style={{ fontFamily: 'var(--font-cfmono), monospace', fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-faint)', margin: '3px 0 0' }}>{formatDate(tx.created_at)}</p>
                </div>
                <span style={{ fontFamily: HANKEN, fontSize: 15, fontWeight: 700, color: tx.amount > 0 ? '#3F7A4E' : 'var(--ember-deep)' }}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

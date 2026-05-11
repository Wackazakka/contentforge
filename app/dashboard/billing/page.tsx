'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/authContext'
import { PLANS, PlanKey } from '@/lib/stripe'

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
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  const planConfig = subscription?.plan ? PLANS[subscription.plan] : null

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6" style={{ color: '#0C447C' }}>Billing</h1>

      {/* Current plan */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Current plan</p>
        {planConfig && subscription ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold text-gray-900">{planConfig.name}</p>
              <p className="text-sm text-gray-500 mt-1">
                Status:{' '}
                <span className={subscription.status === 'active' ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                  {subscription.status}
                </span>
              </p>
              {subscription.current_period_end && (
                <p className="text-sm text-gray-500 mt-0.5">
                  Renews {formatDate(subscription.current_period_end)}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold" style={{ color: '#0C447C' }}>${planConfig.price}</p>
              <p className="text-sm text-gray-500">/mo</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-gray-600 mb-3">You don't have an active subscription.</p>
            <a
              href="/pricing"
              className="inline-block rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: '#185FA5' }}
            >
              View plans →
            </a>
          </div>
        )}

        {planConfig && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <button
              onClick={handleManage}
              disabled={portalLoading}
              className="w-full py-2.5 rounded-xl font-semibold text-sm border transition-colors disabled:opacity-50"
              style={{ borderColor: '#378ADD', color: '#185FA5' }}
            >
              {portalLoading ? 'Opening...' : 'Manage subscription'}
            </button>
          </div>
        )}
      </div>

      {/* Credits */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Credits</p>
        <div className="flex items-end gap-3 mb-4">
          <p className="text-5xl font-bold" style={{ color: '#0C447C' }}>{balance ?? 0}</p>
          <p className="text-gray-500 mb-1">credits remaining</p>
        </div>
        {planConfig && (
          <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: '#EBF4FF' }}>
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">📹 Video production</span>
              <span className="font-semibold">10 credits</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">📄 Article generation</span>
              <span className="font-semibold">1 credit</span>
            </div>
          </div>
        )}
      </div>

      {/* Transaction history */}
      {transactions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Transaction history</p>
          <div className="space-y-3">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900">{tx.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(tx.created_at)}</p>
                </div>
                <span
                  className={`text-sm font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-500'}`}
                >
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

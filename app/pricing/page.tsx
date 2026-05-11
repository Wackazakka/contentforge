'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/authContext'
import { PLANS } from '@/lib/stripe'

const features = {
  starter: [
    '100 kreditter/mnd (~10 videoer)',
    'Ubegrenset publisering',
    'Facebook, Instagram, LinkedIn, X',
    'AI-artikkelgenerering',
    'Planlagt publisering',
  ],
  pro: [
    '350 kreditter/mnd (~35 videoer)',
    'Alt i Starter',
    'TikTok-publisering',
    'Innholdskalender',
    'Prioritert støtte',
  ],
  agency: [
    '1000 kreditter/mnd (~100 videoer)',
    'Alt i Pro',
    'Flere produkter/merker',
    'Dedikert support',
    'Egendefinerte integrationer',
  ],
}

export default function PricingPage() {
  const { session } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  const handleSubscribe = async (plan: string) => {
    if (!session) {
      router.push('/register')
      return
    }

    setLoading(plan)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          userId: session.user.id,
          userEmail: session.user.email,
        }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch (err) {
      console.error('Checkout error:', err)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F1EFE8' }}>
      {/* Header */}
      <div className="text-center py-16 px-4">
        <h1 className="text-4xl font-bold mb-4" style={{ color: '#0C447C' }}>
          Enkel, forutsigbar prising
        </h1>
        <p className="text-lg text-gray-600 max-w-xl mx-auto">
          Betal for det du bruker. Kreditter gir deg full fleksibilitet — lag video en måned, artikler den neste.
        </p>
      </div>

      {/* Plans */}
      <div className="max-w-5xl mx-auto px-4 pb-20">
        <div className="grid md:grid-cols-3 gap-6">
          {(['starter', 'pro', 'agency'] as const).map((plan) => {
            const config = PLANS[plan]
            const isPro = plan === 'pro'
            return (
              <div
                key={plan}
                className={`rounded-2xl p-8 flex flex-col ${
                  isPro
                    ? 'bg-[#0C447C] text-white shadow-xl scale-105'
                    : 'bg-white border border-gray-200'
                }`}
              >
                {isPro && (
                  <div className="text-xs font-bold uppercase tracking-widest text-[#378ADD] mb-3">
                    Mest populær
                  </div>
                )}
                <h2 className={`text-xl font-bold mb-1 ${isPro ? 'text-white' : 'text-gray-900'}`}>
                  {config.name}
                </h2>
                <div className="mb-6">
                  <span className={`text-4xl font-bold ${isPro ? 'text-white' : 'text-gray-900'}`}>
                    ${config.price}
                  </span>
                  <span className={`text-sm ml-1 ${isPro ? 'text-blue-200' : 'text-gray-500'}`}>/mnd</span>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {features[plan].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className={isPro ? 'text-[#1D9E75]' : 'text-[#1D9E75]'}>✓</span>
                      <span className={isPro ? 'text-blue-100' : 'text-gray-600'}>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={loading === plan}
                  className={`w-full py-3 rounded-xl font-semibold transition-colors disabled:opacity-60 ${
                    isPro
                      ? 'bg-[#378ADD] hover:bg-[#185FA5] text-white'
                      : 'bg-[#0C447C] hover:bg-[#185FA5] text-white'
                  }`}
                >
                  {loading === plan ? 'Laster...' : session ? 'Kom i gang' : 'Registrer deg'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Credit cost table */}
        <div className="mt-16 bg-white rounded-2xl border border-gray-200 p-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Hva koster en kreditt?</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-gray-600">📹 Videoproduksjon (med voiceover + bilder)</span>
              <span className="font-semibold text-gray-900">10 kreditter</span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-gray-600">📄 Artikkelgenerering</span>
              <span className="font-semibold text-gray-900">1 kreditt</span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-gray-600">🚀 Publisering (alle plattformer)</span>
              <span className="font-semibold text-[#1D9E75]">Gratis</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

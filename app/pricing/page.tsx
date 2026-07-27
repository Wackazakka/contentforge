'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/authContext'
import { PLANS } from '@/lib/stripe'

const features = {
  starter: [
    '100 credits/mo (~10 videos)',
    'Unlimited publishing',
    'Facebook, Instagram, LinkedIn, X',
    'AI article generation',
    'Scheduled publishing',
  ],
  pro: [
    '350 credits/mo (~35 videos)',
    'Everything in Starter',
    'TikTok publishing',
    'Content calendar',
    'Priority support',
  ],
  agency: [
    '1000 credits/mo (~100 videos)',
    'Everything in Pro',
    'Multiple products/brands',
    'Dedicated support',
    'Custom integrations',
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
    <div className="min-h-screen" style={{ backgroundColor: '#F4EEE2' }}>
      {/* Header */}
      <div className="text-center py-16 px-4">
        <h1 className="text-4xl font-bold mb-4" style={{ color: '#1C1A16' }}>
          Simple, predictable pricing
        </h1>
        <p className="text-lg text-gray-600 max-w-xl mx-auto">
          Pay for what you use. Credits give you full flexibility — create videos one month, articles the next.
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
                    ? 'bg-[#1C1A16] text-white shadow-xl scale-105'
                    : 'bg-white border border-gray-200'
                }`}
              >
                {isPro && (
                  <div className="text-xs font-bold uppercase tracking-widest text-[#E3A883] mb-3">
                    Most popular
                  </div>
                )}
                <h2 className={`text-xl font-bold mb-1 ${isPro ? 'text-white' : 'text-gray-900'}`}>
                  {config.name}
                </h2>
                <div className="mb-6">
                  <span className={`text-4xl font-bold ${isPro ? 'text-white' : 'text-gray-900'}`}>
                    ${config.price}
                  </span>
                  <span className={`text-sm ml-1 ${isPro ? 'text-blue-200' : 'text-gray-500'}`}>/mo</span>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {features[plan].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className={isPro ? 'text-[#3F7A4E]' : 'text-[#3F7A4E]'}>✓</span>
                      <span className={isPro ? 'text-blue-100' : 'text-gray-600'}>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={loading === plan}
                  className={`w-full py-3 rounded-xl font-semibold transition-colors disabled:opacity-60 ${
                    isPro
                      ? 'bg-[#E3A883] hover:bg-[var(--ember-deep)] text-white'
                      : 'bg-[#1C1A16] hover:bg-[var(--ember-deep)] text-white'
                  }`}
                >
                  {loading === plan ? 'Loading...' : session ? 'Get started' : 'Sign up'}
                </button>
              </div>
            )
          })}
        </div>

        {/* Credit cost table */}
        <div className="mt-16 bg-white rounded-2xl border border-gray-200 p-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">What does a credit cost?</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-gray-600">📹 Video production (with voiceover + images)</span>
              <span className="font-semibold text-gray-900">10 credits</span>
            </div>
            <div className="flex justify-between py-3 border-b border-gray-100">
              <span className="text-gray-600">📄 Article generation</span>
              <span className="font-semibold text-gray-900">1 credit</span>
            </div>
            <div className="flex justify-between py-3">
              <span className="text-gray-600">🚀 Publishing (all platforms)</span>
              <span className="font-semibold text-[#3F7A4E]">Free</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

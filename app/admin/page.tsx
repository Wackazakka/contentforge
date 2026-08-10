'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/authContext'
import { PLANS, PlanKey } from '@/lib/stripe'

interface Stats {
  totalUsers: number
  activeSubscriptions: number
  totalCredits: number
  totalVideos: number
  planBreakdown: Record<string, number>
}

interface User {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  balance: number
  plan: PlanKey | null
  sub_status: string | null
  period_end: string | null
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-bold" style={{ color: 'var(--ink)' }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminPage() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? ''

  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Credit adjustment state
  const [adjustingId, setAdjustingId] = useState<string | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  useEffect(() => {
    if (!userId) return
    const load = async () => {
      // Sesjonen beviser hvem vi er. Foer sendte vi bare bruker-id-en i
      // adressen, og serveren stolte paa den — se lib/adminAuth.
      const h = { Authorization: `Bearer ${session?.access_token ?? ''}` }
      const [statsRes, usersRes] = await Promise.all([
        fetch('/api/admin/stats', { headers: h }),
        fetch('/api/admin/users', { headers: h }),
      ])
      const statsData = await statsRes.json()
      const usersData = await usersRes.json()
      setStats(statsData)
      setUsers(usersData.users ?? [])
      setLoading(false)
    }
    load()
  }, [userId, session])

  const handleAdjust = async (targetUserId: string) => {
    const amount = parseInt(adjustAmount)
    if (isNaN(amount) || amount === 0) return
    setAdjusting(true)
    const res = await fetch('/api/admin/credits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ targetUserId, amount, description: adjustNote || undefined }),
    })
    const data = await res.json()
    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUserId ? { ...u, balance: data.newBalance } : u))
      )
      setAdjustingId(null)
      setAdjustAmount('')
      setAdjustNote('')
    }
    setAdjusting(false)
  }

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return <div className="text-gray-500 py-12 text-center">Loading...</div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--ink)' }}>Overview</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total users" value={stats?.totalUsers ?? 0} />
        <StatCard
          label="Active subscriptions"
          value={stats?.activeSubscriptions ?? 0}
          sub={
            stats?.planBreakdown
              ? Object.entries(stats.planBreakdown)
                  .map(([plan, count]) => `${PLANS[plan as PlanKey]?.name ?? plan}: ${count}`)
                  .join(' · ')
              : undefined
          }
        />
        <StatCard label="Credits in circulation" value={(stats?.totalCredits ?? 0).toLocaleString()} />
        <StatCard label="Video drafts" value={stats?.totalVideos ?? 0} />
      </div>

      {/* Users table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-gray-700">Users ({users.length})</p>
          <input
            type="text"
            placeholder="Search by email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 w-60"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="px-5 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold">Plan</th>
                <th className="px-4 py-3 text-right font-semibold">Credits</th>
                <th className="px-4 py-3 text-left font-semibold">Joined</th>
                <th className="px-4 py-3 text-left font-semibold">Last sign in</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <>
                  <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{user.email}</td>
                    <td className="px-4 py-3">
                      {user.plan ? (
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{
                            backgroundColor: user.sub_status === 'active' ? 'var(--ember-tint-bg)' : '#FEF2F2',
                            color: user.sub_status === 'active' ? 'var(--ember-deep)' : '#DC2626',
                          }}
                        >
                          {PLANS[user.plan]?.name ?? user.plan}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">Free</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--ink)' }}>
                      {user.balance}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(user.created_at)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(user.last_sign_in_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setAdjustingId(adjustingId === user.id ? null : user.id)
                          setAdjustAmount('')
                          setAdjustNote('')
                        }}
                        className="text-xs font-medium hover:underline"
                        style={{ color: 'var(--ember-deep)' }}
                      >
                        {adjustingId === user.id ? 'Cancel' : 'Adjust credits'}
                      </button>
                    </td>
                  </tr>
                  {adjustingId === user.id && (
                    <tr key={`${user.id}-adjust`} className="bg-blue-50">
                      <td colSpan={6} className="px-5 py-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <input
                            type="number"
                            placeholder="Amount (e.g. 50 or -10)"
                            value={adjustAmount}
                            onChange={(e) => setAdjustAmount(e.target.value)}
                            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          />
                          <input
                            type="text"
                            placeholder="Note (optional)"
                            value={adjustNote}
                            onChange={(e) => setAdjustNote(e.target.value)}
                            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          />
                          <button
                            onClick={() => handleAdjust(user.id)}
                            disabled={adjusting || !adjustAmount || parseInt(adjustAmount) === 0}
                            className="text-sm font-semibold text-white px-4 py-1.5 rounded-lg disabled:opacity-50"
                            style={{ backgroundColor: 'var(--ember-deep)' }}
                          >
                            {adjusting ? 'Saving...' : 'Apply'}
                          </button>
                          <p className="text-xs text-gray-500">
                            Use positive number to add credits, negative to deduct.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-gray-400 text-sm">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

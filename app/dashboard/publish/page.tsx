'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

interface SocialConnection {
  id: string
  platform: string
  page_id: string
  page_name: string
  created_at: string
}

function PublishPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [supabase] = useState(() =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )

  const [connections, setConnections] = useState<SocialConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const connected = searchParams.get('connected')
    if (connected) {
      setMessage(`✅ ${connected} connected successfully!`)
      setTimeout(() => setMessage(null), 3000)
    }

    const error = searchParams.get('error')
    if (error) {
      setMessage(`❌ Error: ${error}`)
    }
  }, [searchParams])

  useEffect(() => {
    const fetchConnections = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('social_connections')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) {
          console.error('[publish] Error fetching connections:', error)
          setMessage('❌ Failed to load connections')
          return
        }

        setConnections(data || [])
      } catch (err) {
        console.error('[publish] Error:', err)
        setMessage('❌ Error loading connections')
      } finally {
        setLoading(false)
      }
    }

    fetchConnections()
  }, [supabase])

  const handleDisconnect = async (id: string) => {
    if (!confirm('Are you sure you want to disconnect this account?')) return

    try {
      const { error } = await supabase.from('social_connections').delete().eq('id', id)

      if (error) {
        setMessage('❌ Failed to disconnect')
        return
      }

      setConnections(connections.filter((c) => c.id !== id))
      setMessage('✅ Account disconnected')
      setTimeout(() => setMessage(null), 2000)
    } catch (err) {
      console.error('[publish] Disconnect error:', err)
      setMessage('❌ Error disconnecting')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">📱 Publiseringsverktøy</h1>
        <p className="text-gray-600 mb-6">Koble til og administrer dine sosiale medier-kontoer</p>

        {message && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            {message}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {/* Facebook/Instagram Connect */}
          <div className="bg-white p-6 rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-500 transition-colors">
            <div className="text-3xl mb-2">f</div>
            <h2 className="font-semibold text-gray-900 mb-2">Facebook / Instagram</h2>
            <p className="text-sm text-gray-600 mb-4">Koble til dine Facebook-sider og Instagram-kontoer</p>
            <a
              href="/api/auth/facebook"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              🔗 Koble til Facebook
            </a>
          </div>

          {/* TikTok Connect (placeholder) */}
          <div className="bg-white p-6 rounded-lg border-2 border-dashed border-gray-300 opacity-50">
            <div className="text-3xl mb-2">♪</div>
            <h2 className="font-semibold text-gray-900 mb-2">TikTok</h2>
            <p className="text-sm text-gray-600 mb-4">Kommer snart</p>
            <button disabled className="inline-block px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed text-sm font-medium">
              🔗 Koble til TikTok
            </button>
          </div>

          {/* LinkedIn Connect (placeholder) */}
          <div className="bg-white p-6 rounded-lg border-2 border-dashed border-gray-300 opacity-50">
            <div className="text-3xl mb-2">in</div>
            <h2 className="font-semibold text-gray-900 mb-2">LinkedIn</h2>
            <p className="text-sm text-gray-600 mb-4">Kommer snart</p>
            <button disabled className="inline-block px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed text-sm font-medium">
              🔗 Koble til LinkedIn
            </button>
          </div>
        </div>

        {/* Connected Accounts */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {loading ? 'Laster...' : `Dine kontoer (${connections.length})`}
          </h2>

          {loading ? (
            <p className="text-gray-500">Laster forbindelser...</p>
          ) : connections.length === 0 ? (
            <p className="text-gray-500">Ingen kontoer koblet til ennå. Klikk på knappene ovenfor for å koble til.</p>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <div key={conn.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <div className="font-medium text-gray-900">
                      {conn.platform === 'facebook' ? '📘' : '📷'} {conn.page_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {conn.platform} • ID: {conn.page_id}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDisconnect(conn.id)}
                    className="px-3 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded text-sm font-medium transition-colors"
                  >
                    🔌 Koble fra
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PublishPage

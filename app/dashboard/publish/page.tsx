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
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Publiser innhold</h1>

      {message && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          {message}
        </div>
      )}

      {/* Koblede kontoer */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="font-semibold mb-4">Koblede kontoer</h2>
        {connections.length === 0 ? (
          <div>
            <p className="text-gray-500 mb-4">Ingen kontoer koblet ennå.</p>
            <a
              href="/api/auth/facebook"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
            >
              Koble til Facebook/Instagram
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span>{c.platform === 'facebook' ? '📘' : '📸'}</span>
                <span className="font-medium">{c.page_name}</span>
                <span className="text-xs text-gray-400">{c.platform}</span>
              </div>
            ))}
            <a
              href="/api/auth/facebook"
              className="inline-block mt-2 text-sm text-blue-600 hover:underline"
            >
              + Koble til flere kontoer
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default PublishPage

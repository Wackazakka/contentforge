'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface JobStatus {
  jobId: string
  status: 'queued' | 'generating' | 'rendering' | 'uploading' | 'done' | 'failed'
  videoUrl?: string
  error?: string
}

export default function VideoStatusPage() {
  const { id: productId, jobId } = useParams<{ id: string; jobId: string }>()
  const router = useRouter()
  const [job, setJob] = useState<JobStatus | null>(null)
  const [dots, setDots] = useState('')

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/job-status/${jobId}`)
        const data = await res.json()
        setJob(data)
        if (data.status === 'done' || data.status === 'failed') return
        setTimeout(poll, 4000)
      } catch (err) {
        setTimeout(poll, 6000)
      }
    }
    poll()
  }, [jobId])

  useEffect(() => {
    if (job?.status === 'done' || job?.status === 'failed') return
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'))
    }, 500)
    return () => clearInterval(interval)
  }, [job?.status])

  const statusLabel: Record<string, string> = {
    queued: '⏳ Venter i kø',
    generating: '🎙️ Genererer voiceovers',
    rendering: '🎬 Renderer video',
    uploading: '☁️ Laster opp',
    done: '✅ Ferdig!',
    failed: '❌ Feil',
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-lg w-full text-center">
        <h1 className="text-2xl font-bold mb-2">Videoproduksjon</h1>
        <p className="text-gray-500 text-sm mb-8">Jobb-ID: {jobId}</p>

        {!job && <p className="text-gray-400">Kobler til{dots}</p>}

        {job && job.status !== 'done' && job.status !== 'failed' && (
          <div>
            <div className="text-4xl mb-4 animate-pulse">🎬</div>
            <p className="text-lg font-medium">
              {statusLabel[job.status]}
              {dots}
            </p>
            <p className="text-sm text-gray-400 mt-2">Dette tar vanligvis 2-4 minutter</p>
            <div className="mt-6 bg-gray-100 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
                style={{
                  width:
                    job.status === 'queued'
                      ? '10%'
                      : job.status === 'generating'
                        ? '40%'
                        : job.status === 'rendering'
                          ? '75%'
                          : job.status === 'uploading'
                            ? '90%'
                            : '100%',
                }}
              />
            </div>
          </div>
        )}

        {job?.status === 'done' && job.videoUrl && (
          <div>
            <p className="text-green-600 font-semibold text-lg mb-4">✅ Videoen er klar!</p>
            <video
              src={`/api/video/${jobId}`}
              controls
              className="rounded-xl mb-6 mx-auto"
              style={{ maxHeight: '600px', maxWidth: '340px', width: '100%' }}
            />
            <div className="flex gap-3 justify-center flex-wrap">
              <a
                href={`/api/video/${jobId}`}
                download={`video-${jobId}.mp4`}
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                ⬇️ Last ned
              </a>
              <button
                onClick={() => router.push(`/dashboard/products/${productId}`)}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                Tilbake til produkt
              </button>
            </div>
          </div>
        )}

        {job?.status === 'failed' && (
          <div>
            <p className="text-red-600 font-semibold text-lg mb-2">❌ Produksjon feilet</p>
            <p className="text-sm text-gray-500 mb-6">{job.error}</p>
            <button
              onClick={() => router.back()}
              className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-200"
            >
              Prøv igjen
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

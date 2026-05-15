'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

interface JobStatus {
  jobId: string
  status: 'queued' | 'generating' | 'rendering' | 'uploading' | 'done' | 'failed'
  videoUrl?: string
  error?: string
}

export default function VideoStatusPage() {
  const { id: productId, jobId } = useParams<{ id: string; jobId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('videoStatus')
  const formatParam = searchParams?.get('format') || '9:16'

  // Map the chosen video format to a CSS aspect-ratio plus a sensible max width
  // so portrait, square and landscape videos all fit nicely inside the card.
  const formatStyle: { aspectRatio: string; maxWidth: string } =
    formatParam === '16:9'
      ? { aspectRatio: '16/9', maxWidth: '560px' }
      : formatParam === '1:1'
        ? { aspectRatio: '1/1', maxWidth: '360px' }
        : { aspectRatio: '9/16', maxWidth: '280px' }
  const [job, setJob] = useState<JobStatus | null>(null)
  const [dots, setDots] = useState('')
  const [videoError, setVideoError] = useState<string | null>(null)

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/job-status/${jobId}`)
        const data = await res.json()
        setJob(data)
        if (data.status === 'done') setVideoError(null) // clear any stale error
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
    queued: t('statusQueued'),
    generating: t('statusGenerating'),
    rendering: t('statusRendering'),
    uploading: t('statusUploading'),
    done: t('statusDone'),
    failed: t('statusFailed'),
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-lg w-full text-center">
        <h1 className="text-2xl font-bold mb-2">{t('title')}</h1>
        <p className="text-gray-500 text-sm mb-8">{t('jobId', { jobId })}</p>

        {!job && <p className="text-gray-400">{t('connecting')}{dots}</p>}

        {job && job.status !== 'done' && job.status !== 'failed' && (
          <div>
            <div className="text-4xl mb-4 animate-pulse">🎬</div>
            <p className="text-lg font-medium">
              {statusLabel[job.status]}
              {dots}
            </p>
            <p className="text-sm text-gray-400 mt-2">{t('takesTime')}</p>
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
            <p className="text-green-600 font-semibold text-lg mb-4">{t('videoReady')}</p>
            {/* Aspect-ratio container — forces correct shape before metadata loads */}
            <div className="mx-auto mb-6 rounded-xl overflow-hidden bg-black" style={{ maxWidth: formatStyle.maxWidth, aspectRatio: formatStyle.aspectRatio }}>
              <video
                key={job.videoUrl}
                src={`/api/video-proxy?url=${encodeURIComponent(job.videoUrl)}`}
                controls
                playsInline
                preload="auto"
                className="w-full h-full object-contain"
                onError={(e) => {
                  const v = e.currentTarget
                  const codeMap: Record<number, string> = { 1: 'ABORTED', 2: 'NETWORK', 3: 'DECODE', 4: 'SRC_NOT_SUPPORTED' }
                  const msg = `Feil ${v.error?.code ?? '?'}: ${codeMap[v.error?.code ?? 0] ?? 'UNKNOWN'} — ${v.error?.message ?? 'ingen detaljer'}`
                  console.error('[VideoPlayer]', msg, 'src:', v.currentSrc)
                  setVideoError(msg)
                }}
              />
            </div>
            {videoError && (
              <div className="mb-4 text-xs text-red-500 bg-red-50 rounded px-3 py-2 text-left break-all">
                ⚠️ {videoError}
              </div>
            )}
            <div className="flex gap-3 justify-center flex-wrap">
              <a
                href={job.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                {t('openVideo')}
              </a>
              <a
                href={`/api/video-proxy?url=${encodeURIComponent(job.videoUrl)}`}
                download={`video-${jobId}.mp4`}
                className="bg-[#185FA5] text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                {t('download')}
              </a>
              <button
                onClick={() => router.push(`/dashboard/products/${productId}`)}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                {t('backToProduct')}
              </button>
            </div>
          </div>
        )}

        {job?.status === 'failed' && (
          <div>
            <p className="text-red-600 font-semibold text-lg mb-2">{t('productionFailed')}</p>
            <p className="text-sm text-gray-500 mb-6">{job.error}</p>
            <button
              onClick={() => router.back()}
              className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-200"
            >
              {t('tryAgain')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

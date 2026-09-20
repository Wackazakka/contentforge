import { getTranslations, getLocale } from 'next-intl/server'
import { admin } from '@/lib/gateway'
import { DecisionButtons } from './DecisionButtons'

// Skuespillerens godkjenningsside — nås via magisk lenke fra e-postvarselet.
// Viser innholdet (lyd/bilde) og lar skuespilleren godkjenne eller avvise.
// Tokenet er autorisasjonen; siden fungerer uten innlogging.

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = await getTranslations('approval')
  const locale = await getLocale()
  const { data: row } = await admin()
    .from('usage_approvals')
    .select('*, voice_actors(name)')
    .eq('review_token', token)
    .single()

  if (!row) {
    return (
      <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center px-4">
        <p className="text-gray-500">{t('invalid')}</p>
      </div>
    )
  }

  const expired = row.status === 'pending' && new Date(row.expires_at) <= new Date()
  const decided = row.status !== 'pending' || expired
  const frist = new Date(row.expires_at).toLocaleString(locale === 'no' ? 'nb-NO' : 'en-GB')
  const actorName = (row as any).voice_actors?.name || t('the_actor')

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('h1')}</h1>
        <p className="text-gray-600 mb-8">
          {t(row.asset_type === 'face' ? 'intro_face' : 'intro_voice', { name: actorName })}
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          {row.asset_type === 'face' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.content_url} alt={t('alt')} className="w-full rounded-lg border border-gray-200 mb-4" />
          ) : (
            <audio controls src={row.content_url} className="w-full mb-4" />
          )}
          {row.detail && (
            <div className="text-sm text-gray-600 border-t border-gray-100 pt-3">
              <span className="font-medium text-gray-700">{t(row.asset_type === 'face' ? 'label_motive' : 'label_script')}</span> {row.detail}
            </div>
          )}
        </div>

        {decided ? (
          <div className={`p-4 rounded-lg text-sm ${row.status === 'rejected' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
            {row.status === 'rejected'
              ? t('rejected_note')
              : expired && row.status === 'pending'
                ? t('expired_note', { deadline: frist })
                : t(row.decided_via === 'timeout' ? 'approved_timeout_note' : 'approved_note')}
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {t.rich('deadline_note', { deadline: frist, b: (c) => <strong>{c}</strong> })}
            </p>
            <DecisionButtons token={token} />
          </>
        )}
      </div>
    </div>
  )
}

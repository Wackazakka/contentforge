'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useTranslations } from 'next-intl'

type Publication = {
  id: string
  platform: string
  status: string
  content_type: string
  created_at: string
  publish_at?: string
  product_id?: string
}

type ScheduledPublication = {
  id: string
  platform: string
  content_type: string
  scheduled_at: string
  production_id?: string
}

type CalendarEntry = {
  id: string
  platform: string
  status: 'scheduled' | 'published' | 'failed'
  content_type: string
  date: string
  isScheduled: boolean
  product_id?: string
}

type Product = {
  id: string
  name: string
}

const HANKEN = 'var(--font-hanken), sans-serif'
const MONO = 'var(--font-cfmono), monospace'

const PLATFORMS = ['All', 'facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'youtube']
const STATUSES = ['All', 'scheduled', 'published', 'failed']

const statusColor: Record<string, string> = {
  scheduled: 'var(--ember-deep)',
  published: '#3F7A4E',
  failed: 'var(--ember-deep)',
}

const statusBg: Record<string, string> = {
  scheduled: 'var(--ember-tint-bg)',
  published: '#E4EFE0',
  failed: '#FBEAE6',
}

const statusBorder: Record<string, string> = {
  scheduled: 'var(--ember-tint-border)',
  published: '#CADBC4',
  failed: '#F0C4B8',
}

const platformLabel: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  x: 'X',
  youtube: 'YouTube',
}

const filterSelectStyle: React.CSSProperties = {
  fontFamily: HANKEN, fontSize: 14, color: '#1C1A16', background: '#FFFDF8',
  border: '1px solid #D8CDB8', borderRadius: 9, padding: '8px 12px', cursor: 'pointer',
}

function Badge({ status }: { status: string }) {
  return (
    <span
      style={{
        fontFamily: HANKEN, fontSize: 12.5, fontWeight: 600, textTransform: 'capitalize',
        color: statusColor[status] || '#6B6358', background: statusBg[status] || '#F7F1E6',
        border: `1px solid ${statusBorder[status] || '#E6DDCC'}`, borderRadius: 999, padding: '3px 11px',
      }}
    >
      {status}
    </span>
  )
}

export default function CalendarPage() {
  const t = useTranslations('calendar')
  const [entries, setEntries] = useState<CalendarEntry[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [platformFilter, setPlatformFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [productFilter, setProductFilter] = useState('All')
  const [view, setView] = useState<'table' | 'calendar'>('table')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [currentMonth, setCurrentMonth] = useState(new Date())

  async function load() {
    setLoading(true)
    const [pubRes, schedRes, prodRes] = await Promise.all([
      supabase.from('publications').select('id,platform,status,content_type,created_at,product_id').order('created_at', { ascending: false }).limit(200),
      supabase.from('scheduled_publications').select('id,platform,content_type,scheduled_at,production_id').order('scheduled_at', { ascending: true }).limit(200),
      supabase.from('products').select('id,name').order('name'),
    ])

    const published: CalendarEntry[] = (pubRes.data || []).map((p: Publication) => ({
      id: p.id,
      platform: p.platform,
      status: (p.status as CalendarEntry['status']) || 'published',
      content_type: p.content_type || 'video',
      date: p.created_at,
      isScheduled: false,
      product_id: p.product_id,
    }))

    const scheduled: CalendarEntry[] = (schedRes.data || []).map((s: ScheduledPublication) => ({
      id: s.id,
      platform: s.platform,
      status: 'scheduled' as const,
      content_type: s.content_type || 'video',
      date: s.scheduled_at,
      isScheduled: true,
      product_id: s.production_id,
    }))

    setProducts(prodRes.data || [])
    setEntries([...scheduled, ...published])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(entry: CalendarEntry) {
    if (!entry.isScheduled) return
    setDeleting(entry.id)
    await supabase.from('scheduled_publications').delete().eq('id', entry.id)
    setEntries(prev => prev.filter(e => e.id !== entry.id))
    setDeleting(null)
  }

  const filtered = entries.filter(e => {
    if (platformFilter !== 'All' && e.platform !== platformFilter) return false
    if (statusFilter !== 'All' && e.status !== statusFilter) return false
    if (productFilter !== 'All' && e.product_id !== productFilter) return false
    return true
  })

  // Calendar helpers
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel = currentMonth.toLocaleString('en-GB', { month: 'long', year: 'numeric' })

  function entriesForDay(day: number) {
    return filtered.filter(e => {
      const d = new Date(e.date)
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    })
  }

  const segStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: HANKEN, fontSize: 14, fontWeight: active ? 600 : 500,
    color: active ? 'var(--ember-deep)' : '#6B6358', background: active ? 'var(--ember-tint-bg)' : 'transparent',
    border: active ? '1px solid var(--ember-tint-border)' : '1px solid transparent', borderRadius: 999,
    padding: '7px 16px', cursor: 'pointer',
  })

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 className="cf-h1">{t('title')}</h1>
        <div style={{ display: 'inline-flex', alignItems: 'center', background: '#F0E8D9', border: '1px solid #E0D7C6', borderRadius: 999, padding: 3 }}>
          <button onClick={() => setView('table')} style={segStyle(view === 'table')}>{t('tableView')}</button>
          <button onClick={() => setView('calendar')} style={segStyle(view === 'calendar')}>{t('calendarView')}</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: HANKEN, fontSize: 13, color: '#6B6358' }}>{t('platformFilter')}</span>
          <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} style={filterSelectStyle}>
            {PLATFORMS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: HANKEN, fontSize: 13, color: '#6B6358' }}>{t('statusFilter')}</span>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={filterSelectStyle}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        {products.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: HANKEN, fontSize: 13, color: '#6B6358' }}>{t('productFilter')}</span>
            <select value={productFilter} onChange={e => setProductFilter(e.target.value)} style={filterSelectStyle}>
              <option value="All">{t('allProducts')}</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.04em', color: '#A89C88' }}>{t('posts', { count: filtered.length })}</span>
      </div>

      {loading ? (
        <p style={{ fontFamily: HANKEN, fontSize: 14, color: '#A89C88' }}>{t('loading')}</p>
      ) : filtered.length === 0 ? (
        <div className="cf-panel" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ fontFamily: HANKEN, fontSize: 14, color: '#A89C88', margin: 0 }}>{t('noPostsFound')}</p>
        </div>
      ) : view === 'table' ? (
        <div className="cf-panel" style={{ padding: '6px 26px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E6DDCC' }}>
                {[t('dateHeader'), t('platformHeader'), t('typeHeader'), t('statusHeader')].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '16px 8px 13px 0', fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#A89C88' }}>{h}</th>
                ))}
                <th style={{ padding: '16px 0 13px' }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id} style={{ borderTop: '1px solid #EFE7D8' }}>
                  <td style={{ padding: '15px 8px 15px 0', fontFamily: HANKEN, fontSize: 14.5, color: '#1C1A16' }}>
                    {new Date(entry.date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={{ padding: '15px 8px', fontFamily: HANKEN, fontSize: 14.5, color: '#3A352C', textTransform: 'capitalize' }}>
                    {platformLabel[entry.platform] || entry.platform}
                  </td>
                  <td style={{ padding: '15px 8px', fontFamily: HANKEN, fontSize: 14, color: '#6B6358', textTransform: 'capitalize' }}>{entry.content_type}</td>
                  <td style={{ padding: '15px 8px' }}><Badge status={entry.status} /></td>
                  <td style={{ padding: '15px 0', textAlign: 'right' }}>
                    {entry.isScheduled && (
                      <button
                        onClick={() => handleDelete(entry)}
                        disabled={deleting === entry.id}
                        style={{ fontFamily: HANKEN, fontSize: 12.5, fontWeight: 600, color: 'var(--ember-deep)', background: '#FBEAE6', border: '1px solid #F0C4B8', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}
                      >
                        {deleting === entry.id ? '...' : t('deleteButton')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Calendar view */
        <div className="cf-panel" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} style={{ fontSize: 20, padding: '0 8px', color: '#6B6358', background: 'transparent', border: 'none', cursor: 'pointer' }}>‹</button>
            <span style={{ fontFamily: 'var(--font-serif), serif', fontSize: 24, color: '#1C1A16', textTransform: 'capitalize' }}>{monthLabel}</span>
            <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} style={{ fontSize: 20, padding: '0 8px', color: '#6B6358', background: 'transparent', border: 'none', cursor: 'pointer' }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8, marginBottom: 8 }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A89C88' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
            {Array.from({ length: (firstDay === 0 ? 6 : firstDay - 1) }).map((_, i) => (
              <div key={`empty-${i}`} style={{ minHeight: 62 }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayEntries = entriesForDay(day)
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year
              return (
                <div key={day} style={{ position: 'relative', minHeight: 62, background: '#F7F1E6', border: '1px solid #EFE7D8', borderRadius: 9, padding: 8 }}>
                  <div style={{ fontFamily: HANKEN, fontSize: 13, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', ...(isToday ? { background: 'var(--ember)', color: '#fff', fontWeight: 600 } : { color: '#6B6358' }) }}>
                    {day}
                  </div>
                  {dayEntries.slice(0, 3).map(e => (
                    <div key={e.id} style={{ fontFamily: HANKEN, fontSize: 11, padding: '1px 5px', borderRadius: 5, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: statusBg[e.status], color: statusColor[e.status] }}>
                      {platformLabel[e.platform] || e.platform}
                    </div>
                  ))}
                  {dayEntries.length > 3 && (
                    <div style={{ fontFamily: HANKEN, fontSize: 11, color: '#A89C88', marginTop: 2 }}>{t('more', { count: dayEntries.length - 3 })}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

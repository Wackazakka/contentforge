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

const PLATFORMS = ['All', 'facebook', 'instagram']
const STATUSES = ['All', 'scheduled', 'published', 'failed']

const statusColor: Record<string, string> = {
  scheduled: '#185FA5',
  published: '#1D9E75',
  failed: '#ef4444',
}

const statusBg: Record<string, string> = {
  scheduled: '#E6F1FB',
  published: '#EAF3DE',
  failed: '#fef2f2',
}

const platformLabel: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
}

function Badge({ status }: { status: string }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
      style={{ backgroundColor: statusBg[status] || '#F1EFE8', color: statusColor[status] || '#6b7280' }}>
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0C447C' }}>{t('title')}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setView('table')}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={view === 'table' ? { backgroundColor: '#EBF4FF', color: '#185FA5' } : { color: '#6b7280' }}
          >{t('tableView')}</button>
          <button
            onClick={() => setView('calendar')}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={view === 'calendar' ? { backgroundColor: '#EBF4FF', color: '#185FA5' } : { color: '#6b7280' }}
          >{t('calendarView')}</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div>
          <label className="text-xs font-medium mr-1" style={{ color: '#6b7280' }}>{t('platformFilter')}</label>
          <select
            value={platformFilter}
            onChange={e => setPlatformFilter(e.target.value)}
            className="text-sm rounded-lg px-3 py-1.5 border"
            style={{ backgroundColor: '#ffffff', borderColor: '#d1cec7', color: '#2C2C2A' }}
          >
            {PLATFORMS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium mr-1" style={{ color: '#6b7280' }}>{t('statusFilter')}</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-sm rounded-lg px-3 py-1.5 border"
            style={{ backgroundColor: '#ffffff', borderColor: '#d1cec7', color: '#2C2C2A' }}
          >
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        {products.length > 0 && (
          <div>
            <label className="text-xs font-medium mr-1" style={{ color: '#6b7280' }}>{t('productFilter')}</label>
            <select
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              className="text-sm rounded-lg px-3 py-1.5 border"
              style={{ backgroundColor: '#ffffff', borderColor: '#d1cec7', color: '#2C2C2A' }}
            >
              <option value="All">{t('allProducts')}</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div className="text-xs self-end pb-1.5" style={{ color: '#9ca3af' }}>{t('posts', { count: filtered.length })}</div>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: '#9ca3af' }}>{t('loading')}</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border p-10 text-center" style={{ borderColor: '#e5e2d9', backgroundColor: '#ffffff' }}>
          <p className="text-sm" style={{ color: '#9ca3af' }}>{t('noPostsFound')}</p>
        </div>
      ) : view === 'table' ? (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e5e2d9', backgroundColor: '#ffffff' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e2d9', backgroundColor: '#fafaf8' }}>
                <th className="text-left px-4 py-3 font-medium" style={{ color: '#6b7280' }}>{t('dateHeader')}</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: '#6b7280' }}>{t('platformHeader')}</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: '#6b7280' }}>{t('typeHeader')}</th>
                <th className="text-left px-4 py-3 font-medium" style={{ color: '#6b7280' }}>{t('statusHeader')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => (
                <tr key={entry.id} style={{ borderTop: i > 0 ? '1px solid #f0ede6' : undefined }}>
                  <td className="px-4 py-3" style={{ color: '#2C2C2A' }}>
                    {new Date(entry.date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 capitalize" style={{ color: '#2C2C2A' }}>
                    {platformLabel[entry.platform] || entry.platform}
                  </td>
                  <td className="px-4 py-3 capitalize" style={{ color: '#6b7280' }}>{entry.content_type}</td>
                  <td className="px-4 py-3"><Badge status={entry.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {entry.isScheduled && (
                      <button
                        onClick={() => handleDelete(entry)}
                        disabled={deleting === entry.id}
                        className="text-xs px-2 py-1 rounded"
                        style={{ color: '#ef4444', backgroundColor: '#fef2f2' }}
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
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#e5e2d9', backgroundColor: '#ffffff' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #e5e2d9' }}>
            <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="text-lg px-2" style={{ color: '#6b7280' }}>‹</button>
            <span className="font-semibold capitalize" style={{ color: '#0C447C' }}>{monthLabel}</span>
            <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="text-lg px-2" style={{ color: '#6b7280' }}>›</button>
          </div>
          <div className="grid grid-cols-7">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <div key={d} className="text-center text-xs font-medium py-2" style={{ color: '#9ca3af', borderBottom: '1px solid #f0ede6' }}>{d}</div>
            ))}
            {Array.from({ length: (firstDay === 0 ? 6 : firstDay - 1) }).map((_, i) => (
              <div key={`empty-${i}`} style={{ borderBottom: '1px solid #f0ede6', borderRight: '1px solid #f0ede6', minHeight: 72 }} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayEntries = entriesForDay(day)
              const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year
              return (
                <div key={day} className="p-1" style={{ borderBottom: '1px solid #f0ede6', borderRight: '1px solid #f0ede6', minHeight: 72 }}>
                  <div className="text-xs mb-1 font-medium w-6 h-6 flex items-center justify-center rounded-full"
                    style={isToday ? { backgroundColor: '#185FA5', color: '#fff' } : { color: '#6b7280' }}>
                    {day}
                  </div>
                  {dayEntries.slice(0, 3).map(e => (
                    <div key={e.id} className="text-xs px-1 py-0.5 rounded mb-0.5 truncate"
                      style={{ backgroundColor: statusBg[e.status], color: statusColor[e.status] }}>
                      {platformLabel[e.platform] || e.platform}
                    </div>
                  ))}
                  {dayEntries.length > 3 && (
                    <div className="text-xs" style={{ color: '#9ca3af' }}>{t('more', { count: dayEntries.length - 3 })}</div>
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

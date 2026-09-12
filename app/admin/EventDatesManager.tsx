'use client'

import { useRef, useState } from 'react'
import { weekdayFromISO } from '@/lib/shift-hours'

// The event's overall date range (page_content: config_event_start_date /
// config_event_end_date). The schedule calendars build their day columns from
// this range (plus any event dates outside it), so the columns always carry
// real, correct dates.

const GOLD = 'var(--gold)'

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.5rem', padding: '0.55rem 0.85rem', color: 'var(--cream)', fontSize: '0.875rem',
  fontFamily: 'var(--font-libre-baskerville), Georgia, serif', outline: 'none', width: '180px',
}
const labelStyle: React.CSSProperties = {
  fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase',
  color: GOLD, opacity: 0.65, display: 'block', marginBottom: '0.35rem',
}

function spanDays(start: string, end: string): number | null {
  const a = new Date(`${start}T12:00:00`)
  const b = new Date(`${end}T12:00:00`)
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1
  return days >= 1 ? days : null
}

export function EventDatesManager({ initialStart, initialEnd }: { initialStart: string; initialEnd: string }) {
  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function save(nextStart: string, nextEnd: string) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/page-content', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config_event_start_date: nextStart, config_event_end_date: nextEnd }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setError(d.error ?? 'Failed to save')
          setSaved(false)
        } else {
          setError(null)
          setSaved(true)
          setTimeout(() => setSaved(false), 1800)
        }
      } catch {
        setError('Network error')
        setSaved(false)
      }
    }, 500)
  }

  const update = (nextStart: string, nextEnd: string) => {
    setStart(nextStart)
    setEnd(nextEnd)
    save(nextStart, nextEnd)
  }

  const days = start && end ? spanDays(start, end) : null
  const invalid = !!start && !!end && days === null || (days !== null && days < 1)

  return (
    <div>
      <p style={{ fontSize: '0.78rem', opacity: 0.5, lineHeight: 1.6, margin: '0 0 1.25rem' }}>
        When the event runs. The schedule calendars show a day column for every date in this range
        (events outside it still appear, on their own dated columns).
      </p>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelStyle}>First day</label>
          <input type="date" style={inputStyle} value={start} onChange={e => update(e.target.value, end)} />
          <p style={{ fontSize: '0.72rem', color: GOLD, opacity: 0.6, margin: '0.3rem 0 0' }}>{weekdayFromISO(start) ?? ' '}</p>
        </div>
        <div>
          <label style={labelStyle}>Last day</label>
          <input type="date" style={inputStyle} value={end} onChange={e => update(start, e.target.value)} />
          <p style={{ fontSize: '0.72rem', color: GOLD, opacity: 0.6, margin: '0.3rem 0 0' }}>{weekdayFromISO(end) ?? ' '}</p>
        </div>
        <p style={{ fontSize: '0.8rem', opacity: 0.55, margin: '0 0 1.35rem' }}>
          {invalid ? '⚠ last day is before the first' : days ? `${days} day${days !== 1 ? 's' : ''}` : ''}
        </p>
      </div>

      <div style={{ minHeight: '1.2rem', marginTop: '0.5rem' }}>
        {error && <p style={{ fontSize: '0.78rem', color: 'var(--danger)', margin: 0 }}>{error}</p>}
        {!error && saved && <p style={{ fontSize: '0.72rem', color: GOLD, opacity: 0.6, margin: 0 }}>Saved ✓</p>}
      </div>
    </div>
  )
}

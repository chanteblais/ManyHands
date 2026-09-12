'use client'

// Month calendar for the Lead-Up Gatherings manager — the runway to the event
// at a glance. Sparse dates spread across months are exactly the shape a month
// grid is for (the at-camp schedule, dense over a few days, stays a timetable).
//
// Click an empty day to add a gathering there (date prefilled); click a
// gathering chip to edit it. The configured event range (Configure → Event
// Dates) is tinted so the runway visibly leads somewhere.

import { useMemo, useState } from 'react'
import { parseHHMM } from '@/lib/shift-hours'
import { to24h } from '@/lib/time-format'

type CalendarGathering = {
  id: string
  title: string
  event_date: string | null
  start_time: string | null
  visible: boolean
}

const GOLD = 'var(--gold)'
const PURPLE = 'var(--purple)'
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Local-timezone ISO ("YYYY-MM-DD") — en-CA formats exactly that.
const todayISO = () => new Date().toLocaleDateString('en-CA')

const isoOf = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

// Sort key within a day; legacy display strings ("7:00 PM") parse via to24h.
const startMinutes = (t: string | null) => parseHHMM(t) ?? parseHHMM(to24h(t)) ?? 9999

export function LeadUpCalendar<T extends CalendarGathering>({ events, rangeStart, rangeEnd, onAddDate, onEdit }: {
  events: T[]
  rangeStart?: string
  rangeEnd?: string
  onAddDate: (iso: string) => void
  onEdit: (ev: T) => void
}) {
  const today = todayISO()

  // Open on the month of the next upcoming gathering (an empty current month
  // tells the organizer nothing); fall back to today's month.
  const [month, setMonth] = useState(() => {
    const next = events
      .map(e => e.event_date)
      .filter((d): d is string => !!d && d >= today)
      .sort()[0]
    const anchor = next ? new Date(next + 'T12:00:00') : new Date()
    return { year: anchor.getFullYear(), month: anchor.getMonth() }
  })

  const byDate = useMemo(() => {
    const map: Record<string, T[]> = {}
    for (const e of events) {
      if (!e.event_date) continue
      ;(map[e.event_date] ??= []).push(e)
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => startMinutes(a.start_time) - startMinutes(b.start_time))
    }
    return map
  }, [events])

  const step = (delta: number) => setMonth(({ year, month }) => {
    const d = new Date(year, month + delta, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const firstWeekday = new Date(month.year, month.month, 1).getDay()
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const inEventRange = (iso: string) =>
    !!rangeStart && !!rangeEnd && iso >= rangeStart && iso <= rangeEnd

  const monthCount = Object.entries(byDate)
    .filter(([iso]) => iso.startsWith(isoOf(month.year, month.month, 1).slice(0, 8)))
    .reduce((n, [, list]) => n + list.length, 0)

  const navBtn: React.CSSProperties = {
    background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.4rem',
    color: GOLD, cursor: 'pointer', padding: '0.15rem 0.6rem', fontSize: '0.8rem', opacity: 0.6, lineHeight: 1.4,
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
        <button style={navBtn} onClick={() => step(-1)} aria-label="Previous month">‹</button>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '0.78rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: GOLD, opacity: 0.85 }}>
            {MONTHS[month.month]} {month.year}
          </span>
          {monthCount > 0 && (
            <span style={{ fontSize: '0.68rem', color: 'var(--cream)', opacity: 0.35, marginLeft: '0.6rem' }}>
              {monthCount} gathering{monthCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <button style={navBtn} onClick={() => step(1)} aria-label="Next month">›</button>
      </div>

      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', marginBottom: '3px' }}>
        {WEEKDAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '0.58rem', letterSpacing: '0.14em', color: GOLD, opacity: 0.4, padding: '0.2rem 0' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`pad-${i}`} style={{ minHeight: '64px' }} />
          }
          const iso = isoOf(month.year, month.month, day)
          const dayEvents = byDate[iso] ?? []
          const isToday = iso === today
          const isPast = iso < today
          const isEventDay = inEventRange(iso)
          return (
            <div
              key={iso}
              onClick={() => onAddDate(iso)}
              title={`Add gathering — ${MONTHS[month.month]} ${day}`}
              style={{
                minHeight: '64px', padding: '0.25rem 0.3rem', cursor: 'pointer',
                border: `1px solid ${isToday ? 'rgb(var(--gold-rgb) / 0.45)' : 'rgb(var(--gold-rgb) / 0.1)'}`,
                borderRadius: '0.45rem',
                background: isEventDay ? 'rgb(var(--purple-rgb) / 0.06)' : 'rgba(255,255,255,0.015)',
                opacity: isPast ? 0.45 : 1,
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.15rem' }}>
                <span style={{ fontSize: '0.64rem', color: GOLD, opacity: isToday ? 0.95 : 0.5 }}>{day}</span>
                {isEventDay && iso === rangeStart && (
                  <span style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: PURPLE, opacity: 0.75, textTransform: 'uppercase' }} title="Event days (Configure → Event Dates)">
                    Event
                  </span>
                )}
              </div>
              {dayEvents.map(ev => (
                <button
                  key={ev.id}
                  onClick={e => { e.stopPropagation(); onEdit(ev) }}
                  title={`${ev.title}${ev.visible ? '' : ' (hidden from members)'} — click to edit`}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: 'rgb(var(--gold-rgb) / 0.08)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
                    borderRadius: '0.3rem', color: GOLD, cursor: 'pointer',
                    fontSize: '0.62rem', padding: '0.1rem 0.3rem', marginBottom: '0.15rem',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    opacity: ev.visible ? 0.9 : 0.45,
                  }}
                >
                  {ev.visible ? '' : '○ '}{ev.title}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

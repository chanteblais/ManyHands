'use client'

// The Now / Up next strip — Radio's derived, never-stored layer (docs/radio.md).
// The server supplies today's general + mandatory events; this component picks
// what's live against the MEMBER's clock (their device is at camp; the server
// is in UTC) and re-checks each minute so the strip stays honest all evening.

import { useEffect, useState } from 'react'
import { parseHHMM, clockLabel } from '@/lib/shift-hours'
import type { RadioDayEvent } from '@/lib/radio'

// An event with no end time stays "happening now" for this long.
const OPEN_ENDED_MINUTES = 90

export function RadioNowStrip({ welcome, todayEvents }: {
  welcome: string | null
  todayEvents: RadioDayEvent[]
}) {
  // Minutes since local midnight; null until mounted so the SSR paint and the
  // first client render agree (the strip fills in a beat later).
  const [nowMin, setNowMin] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setNowMin(d.getHours() * 60 + d.getMinutes())
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  let nowLine: string | null = null
  let nextLine: string | null = null
  if (nowMin !== null) {
    const happening = todayEvents.find(e => {
      const start = parseHHMM(e.start_time)
      if (start === null || nowMin < start) return false
      const end = parseHHMM(e.end_time)
      return nowMin < (end !== null && end > start ? end : start + OPEN_ENDED_MINUTES)
    })
    if (happening) {
      const until = parseHHMM(happening.end_time) !== null ? ` · until ${clockLabel(happening.end_time)}` : ''
      nowLine = `${happening.title} is happening now${until}`
    }
    const next = todayEvents.find(e => {
      const start = parseHHMM(e.start_time)
      return start !== null && start > nowMin
    })
    if (next) nextLine = `Up next: ${next.title} · ${clockLabel(next.start_time)}`
  }

  if (!welcome && !nowLine && !nextLine) return null

  return (
    <div
      className="radio-now"
      style={{
        border: '1px solid rgb(var(--gold-rgb) / 0.25)',
        borderRadius: '0.9rem',
        background: 'rgb(var(--gold-rgb) / 0.06)',
        padding: '1rem 1.25rem',
        marginBottom: '2.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}
    >
      {welcome && (
        <p className="radio-now-welcome" style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: '1.05rem', letterSpacing: '0.06em' }}>
          ✦ {welcome}
        </p>
      )}
      {nowLine && (
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--cream)', opacity: 0.9 }}>
          <span style={{ color: 'var(--purple)', marginRight: '0.5rem' }} aria-hidden>●</span>
          {nowLine}
        </p>
      )}
      {nextLine && (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--cream)', opacity: 0.55 }}>
          {nextLine}
        </p>
      )}
    </div>
  )
}

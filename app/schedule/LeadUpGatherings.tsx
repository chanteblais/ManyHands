'use client'

import { useState, useEffect } from 'react'
import { clockRangeLabel } from '@/lib/shift-hours'

export type LeadUpEvent = {
  id: string
  title: string
  description: string | null
  event_date: string | null
  start_time: string | null
  end_time: string | null
  location: string | null
  link: string | null
  host: string | null
  image_url: string | null
  rsvp_count: number
  rsvped: boolean
}

// "2026-07-08" → { weekday: "TUE", date: "Jul 8" }
function formatDate(d: string | null): { weekday: string; date: string } {
  if (!d) return { weekday: '', date: 'TBD' }
  const dt = new Date(d + 'T00:00:00')
  if (isNaN(dt.getTime())) return { weekday: '', date: d }
  return {
    weekday: dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    date: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }
}

function timeLabel(ev: LeadUpEvent): string {
  // Times are stored "HH:MM" (24h); clockRangeLabel formats them for display
  // and passes legacy display strings through untouched.
  return clockRangeLabel(ev.start_time, ev.end_time)
}

export function LeadUpGatherings({ initialEvents }: {
  // Server-rendered pages pass this (docs/architecture.md → Auth → "Server-
  // rendered section data") so the section paints populated; the mount fetch
  // below runs only when it's absent. The API route stays the refresh path.
  initialEvents?: LeadUpEvent[]
} = {}) {
  const [events, setEvents] = useState<LeadUpEvent[]>(initialEvents ?? [])
  const [loading, setLoading] = useState(initialEvents === undefined)
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    if (initialEvents !== undefined) return
    fetch('/api/lead-up-events')
      .then(r => r.ok ? r.json() : { events: [] })
      .then(json => setEvents(json.events ?? []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [])

  const toggleRsvp = async (ev: LeadUpEvent) => {
    setPending(ev.id)
    // Optimistic update; the server response is authoritative.
    const next = !ev.rsvped
    setEvents(prev => prev.map(e => e.id === ev.id
      ? { ...e, rsvped: next, rsvp_count: e.rsvp_count + (next ? 1 : -1) }
      : e))
    try {
      const res = await fetch(`/api/lead-up-events/${ev.id}/rsvp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvp: next }),
      })
      if (res.ok) {
        const json = await res.json()
        setEvents(prev => prev.map(e => e.id === ev.id
          ? { ...e, rsvped: json.rsvped, rsvp_count: json.count } : e))
      } else {
        // Revert on failure.
        setEvents(prev => prev.map(e => e.id === ev.id ? { ...ev } : e))
      }
    } catch {
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...ev } : e))
    } finally {
      setPending(null)
    }
  }

  // Hide the whole section when there's nothing to show.
  if (loading || events.length === 0) return null

  return (
    <div style={{ marginBottom: '3.5rem' }}>
      {/* Inline <style> must use dangerouslySetInnerHTML (React escapes children →
          hydration mismatch on the child combinator + media query). */}
      <style dangerouslySetInnerHTML={{ __html: `
        .leadup-card { display: flex; align-items: center; gap: 1.1rem;
          border-radius: 1rem; border: 1px solid rgb(var(--gold-rgb) / 0.28);
          background: rgba(10,0,20,0.45); padding: 0.9rem 1.2rem; }
        .leadup-divider { width: 1px; align-self: stretch; flex-shrink: 0;
          background: linear-gradient(to bottom, transparent, rgb(var(--gold-rgb) / 0.32), transparent); }
        .leadup-body { flex: 1; min-width: 0; }
        .leadup-rsvp-col { flex-shrink: 0; display: flex; flex-direction: column;
          align-items: flex-end; gap: 0.35rem; }
        @media (max-width: 640px) {
          .leadup-card { flex-wrap: wrap; align-items: flex-start;
            gap: 0.7rem 0.9rem; padding: 0.85rem 1rem; }
          .leadup-divider { display: none; }
          .leadup-body { flex: 1 1 60%; }
          .leadup-rsvp-col { flex: 1 1 100%; align-items: flex-start; }
        }
      ` }} />
      <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.78rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.9, textAlign: 'center', margin: '0 0 0.4rem' }}>
        Before We Gather
      </p>
      <p style={{ fontSize: '0.82rem', opacity: 0.5, textAlign: 'center', fontStyle: 'italic', margin: '0 0 1.75rem' }}>
        Planning &amp; brainstorming sessions on the way to camp — let us know if you'll join.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {events.map(ev => {
          const { weekday, date } = formatDate(ev.event_date)
          const time = timeLabel(ev)
          return (
            <div key={ev.id} className="leadup-card">
              {/* Date block */}
              <div style={{
                flexShrink: 0, width: '66px', textAlign: 'center',
                padding: '0.55rem 0.45rem', border: '1px solid rgb(var(--gold-rgb) / 0.25)',
                borderRadius: '0.6rem', background: 'rgb(var(--gold-rgb) / 0.07)',
              }}>
                <p style={{ fontSize: '0.58rem', letterSpacing: '0.12em', color: 'var(--gold)', opacity: 0.65, margin: '0 0 0.18rem' }}>{weekday}</p>
                <p style={{ fontSize: '0.86rem', color: 'var(--gold)', margin: 0, letterSpacing: '0.02em' }}>{date}</p>
              </div>

              {/* Gold hairline (hidden on mobile) */}
              <div className="leadup-divider" />

              {/* Body */}
              <div className="leadup-body">
                <p style={{ fontSize: '1.05rem', color: 'var(--parchment)', margin: '0 0 0.25rem', fontFamily: 'var(--font-display)' }}>{ev.title}</p>
                {(time || ev.location || ev.host) && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--gold)', opacity: 0.6, margin: '0 0 0.4rem' }}>
                    {[time, ev.location, ev.host && `with ${ev.host}`].filter(Boolean).join('  ·  ')}
                  </p>
                )}
                {ev.description && (
                  <p style={{ fontSize: '0.84rem', opacity: 0.7, lineHeight: 1.6, margin: '0 0 0.5rem' }}>{ev.description}</p>
                )}
                {ev.link && (
                  <a href={ev.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem', color: 'var(--purple)', textDecoration: 'none', opacity: 0.85 }}>
                    Join link →
                  </a>
                )}
              </div>

              {/* RSVP */}
              <div className="leadup-rsvp-col">
                <button
                  onClick={() => toggleRsvp(ev)}
                  disabled={pending === ev.id}
                  style={{
                    padding: '0.4rem 0.9rem', borderRadius: '9999px', cursor: 'pointer',
                    fontSize: '0.76rem', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    border: ev.rsvped ? '1px solid rgb(var(--gold-rgb) / 0.6)' : '1px solid rgb(var(--gold-rgb) / 0.25)',
                    background: ev.rsvped ? 'rgb(var(--gold-rgb) / 0.15)' : 'transparent',
                    color: ev.rsvped ? 'var(--lemon)' : 'var(--gold)',
                    opacity: pending === ev.id ? 0.5 : 1, transition: 'all 0.15s',
                  }}
                >
                  {ev.rsvped ? '✓ Going' : "I'll be there"}
                </button>
                {ev.rsvp_count > 0 && (
                  <span style={{ fontSize: '0.68rem', opacity: 0.4 }}>
                    {ev.rsvp_count} going
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.3), transparent)', margin: '3rem 0 0' }} />
    </div>
  )
}

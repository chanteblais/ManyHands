'use client'

import { useState, useEffect } from 'react'
import { EventIcon } from '@/components/EventIcon'
import { MANDATORY_HUE, shiftHue, generalHue } from '@/lib/shift-colors'
import { firstIsoByWeekday, type ScheduleDay } from '@/lib/schedule-days'
import { displayPlacement } from '@/lib/late-night'

type ScheduleEvent = {
  id: string
  day: string
  time: string
  title: string
  subtitle: string | null
  detail_desc: string | null
  icon_type: string
  highlight: boolean
  is_recurring: boolean
  // Recurring only: NULL = every day; an array of ISO dates = just those days.
  recurrence_days?: string[] | null
  event_date: string | null
  participation_type?: string | null
  shift_color_index?: number | null
}

// Day columns come from the events' real dates + the configured event range
// (lib/schedule-days.ts, built by ScheduleSection) — nothing hardcoded, so the
// headers always show true dates and no event can land on the wrong day.

const PX_PER_HOUR = 56

// Colour scheme (lib/shift-colors.ts): mandatory = the old all-hands teal;
// each shift type gets a distinct hue from the palette by registry position;
// general events wear their own stable hue hashed from the event id (they
// used to share one neutral styling, which made neighbours read as twins).

// True when the event carries a colour of its own (bolder title treatment).
function isColored(event: ScheduleEvent): boolean {
  return event.participation_type === 'mandatory'
    || (event.participation_type === 'shift' && event.shift_color_index != null)
}

function eventTypeStyle(event: ScheduleEvent) {
  if (event.participation_type === 'mandatory') {
    return { border: `rgba(${MANDATORY_HUE.rgb},0.45)`, background: `rgba(${MANDATORY_HUE.rgb},0.1)`, text: MANDATORY_HUE.accent }
  }
  if (event.participation_type === 'shift' && event.shift_color_index != null) {
    const hue = shiftHue(event.shift_color_index)
    return { border: `rgba(${hue.rgb},0.5)`, background: `rgba(${hue.rgb},0.1)`, text: hue.accent }
  }
  const hue = generalHue(event.id)
  return { border: `rgba(${hue.rgb},0.5)`, background: `rgba(${hue.rgb},0.12)`, text: hue.accent }
}

// Times + column via the late-night convention (lib/late-night.ts): overnight
// ends wrap past midnight, and an event starting before 6 AM renders at hour
// 24+ in the PREVIOUS night's column — event_date stays the true calendar date.
function place(e: Pick<ScheduleEvent, 'time' | 'event_date'>) {
  return displayPlacement(e.time, e.event_date ?? null)
}

function minutesToTop(minutes: number, startHour: number): number {
  return ((minutes / 60) - startHour) * PX_PER_HOUR
}

function minutesToHeight(startMin: number, endMin: number, startHour: number, endHour: number): number {
  const s = Math.max(startMin / 60, startHour)
  const e = Math.min(endMin / 60, endHour)
  return Math.max((e - s) * PX_PER_HOUR, 28)
}

function buildHourLabels(startHour: number, endHour: number) {
  const labels: { hour: number; label: string }[] = []
  for (let h = startHour; h <= endHour; h++) {
    const display = h % 24
    const h12 = display === 0 ? 12 : display > 12 ? display - 12 : display
    const ampm = display < 12 || display === 0 ? 'AM' : 'PM'
    labels.push({ hour: h, label: display === 0 ? 'Midnight' : display === 12 ? 'Noon' : `${h12} ${ampm}` })
  }
  return labels
}

// ── Recurring Event Card (compact, expandable) ────────────────────────────────

function RecurringEventCard({ event }: { event: ScheduleEvent }) {
  // The card wears the same hue the event has on the calendar grids — one
  // identity per event, wherever it appears. Border + time label carry it;
  // a full background tint reads heavy at card size.
  const style = eventTypeStyle(event)
  return (
    <div style={{ padding: '1.25rem', border: `1px solid ${style.border}`, borderRadius: '0.85rem', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {event.time && (
        <p style={{ fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: style.text, opacity: 0.85, margin: 0, textAlign: 'center' }}>
          {event.time}
        </p>
      )}
      <div style={{ color: 'var(--gold)', opacity: 0.55, display: 'flex', justifyContent: 'center', flex: 1, alignItems: 'center' }}>
        <EventIcon type={event.icon_type} size={38} />
      </div>
      <div style={{ marginTop: 'auto' }}>
        <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--cream)', margin: '0 0 0.4rem', textAlign: 'center' }}>{event.title}</p>
        {event.detail_desc && <p style={{ fontSize: '0.85rem', lineHeight: 1.65, opacity: 0.6, margin: 0, textAlign: 'center' }}>{event.detail_desc}</p>}
      </div>
    </div>
  )
}

// ── Event Block ───────────────────────────────────────────────────────────────

function EventBlock({ event, top, height }: { event: ScheduleEvent; top: number; height: number }) {
  const [expanded, setExpanded] = useState(false)
  const expandedText = event.detail_desc || event.subtitle
  const hasDetail = !!expandedText
  const style = eventTypeStyle(event)

  // Fit the content to the slot instead of slicing it mid-glyph: short blocks
  // drop the icon/caret, and the title clamps to however many full lines fit.
  // Budget (px): padding 8, icon row ~13, caret row ~10, title line ~14.2.
  const TITLE_LINE = 14.2
  const showIcon = height >= 8 + 13 + 2 * TITLE_LINE + 10 // icon + 2 title lines + caret
  const showCaret = hasDetail && height >= 8 + TITLE_LINE + 10
  const chrome = 8 + (showIcon ? 13 : 0) + (showCaret ? 10 : 0)
  const titleLines = Math.max(1, Math.floor((height - chrome) / TITLE_LINE))

  return (
    <div
      title={event.title}
      style={{
        position: 'absolute',
        top,
        left: '2px', right: '2px',
        // The grid slot stays true to the event's duration; the expanded card
        // grows past it (over an opaque backing) so the detail is readable.
        height: expanded ? 'auto' : height,
        minHeight: expanded ? height : undefined,
        borderRadius: '0.35rem',
        border: `1px solid ${style.border}`,
        background: expanded
          ? `linear-gradient(${style.background}, ${style.background}) var(--ink)`
          : style.background,
        boxShadow: expanded
          ? '0 6px 18px rgba(0,0,0,0.55)'
          : event.highlight ? '0 0 10px rgb(var(--gold-rgb) / 0.35), 0 0 20px rgb(var(--gold-rgb) / 0.15)' : undefined,
        overflow: 'hidden',
        cursor: hasDetail ? 'pointer' : 'default',
        zIndex: expanded ? 10 : 1,
        transition: 'border-color 0.15s',
      }}
      onClick={() => hasDetail && setExpanded(o => !o)}
    >
      <div style={{ padding: '0.25rem 0.35rem', height: expanded ? 'auto' : '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', textAlign: 'center' }}>
          {(showIcon || expanded) && (
            <div style={{ color: 'var(--gold)', opacity: 0.65 }}>
              <EventIcon type={event.icon_type} size={10} />
            </div>
          )}
          <p style={{
            fontSize: '0.68rem', color: style.text, margin: 0, lineHeight: 1.3,
            fontWeight: (event.highlight || isColored(event)) ? 600 : 400, wordBreak: 'break-word',
            ...(expanded ? {} : {
              display: '-webkit-box',
              WebkitLineClamp: titleLines,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            }),
          }}>
            {event.title}
          </p>
          {(showCaret || (hasDetail && expanded)) && (
            <span style={{ fontSize: '0.45rem', color: 'var(--gold)', opacity: 0.4 }}>
              {expanded ? '▲' : '▼'}
            </span>
          )}
        </div>
        {expanded && expandedText && (
          <div style={{ marginTop: '0.3rem', paddingTop: '0.3rem', borderTop: '1px solid rgb(var(--gold-rgb) / 0.1)', paddingBottom: '0.15rem' }}>
            <p style={{ fontSize: '0.65rem', opacity: 0.6, margin: 0, lineHeight: 1.5, textAlign: 'center' }}>{expandedText}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Calendar ─────────────────────────────────────────────────────────────

export function ScheduleCalendarClient({ events, days }: { events: ScheduleEvent[]; days: ScheduleDay[] }) {
  const [isMobile, setIsMobile] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string>(days[0]?.iso ?? '')

  useEffect(() => {
    // 768 matches the site-wide mobile-nav breakpoint; below it the 6-column
    // grid squeezes titles into unreadable slivers, so use the day-tab view.
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Undated legacy rows fall back to the first column matching their weekday name.
  const weekdayIso = firstIsoByWeekday(days)
  const columnIso = (e: ScheduleEvent): string | null => place(e).displayDate ?? weekdayIso[e.day] ?? null

  const regular = [...events.filter(e => !e.is_recurring)].sort((a, b) => {
    const dateDiff = (columnIso(a) ?? '9999').localeCompare(columnIso(b) ?? '9999')
    if (dateDiff !== 0) return dateDiff
    return (place(a).start ?? 9999) - (place(b).start ?? 9999)
  })
  const recurring = events.filter(e => e.is_recurring)
  // True every-day events keep their card section below the grid; recurring
  // events pinned to specific dates render as blocks in those day columns.
  const everyDay = recurring.filter(e => !e.recurrence_days)
  const onDays = recurring.filter(e => e.recurrence_days && e.recurrence_days.length > 0)
  const recurringOn = (iso: string) => onDays.filter(e => e.recurrence_days!.includes(iso))
  const untimed = regular.filter(e => !e.time)

  // Compute display window from actual event times (+ 30 min padding each side)
  const allMinutes: number[] = []
  ;[...regular, ...onDays].forEach(e => {
    const { start, end } = place(e)
    if (start != null) allMinutes.push(start)
    if (end != null) allMinutes.push(end)
  })
  const PADDING = 30 // minutes
  const minMinutes = allMinutes.length ? Math.min(...allMinutes) - PADDING : 8 * 60
  const maxMinutes = allMinutes.length ? Math.max(...allMinutes) + PADDING : 24 * 60
  // Round to nearest hour for clean grid lines
  const START_HOUR = Math.floor(minMinutes / 60)
  const END_HOUR = Math.ceil(maxMinutes / 60)
  const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * PX_PER_HOUR
  const HOUR_LABELS = buildHourLabels(START_HOUR, END_HOUR)

  if (events.length === 0) {
    return (
      <p style={{ textAlign: 'center', fontSize: '0.9rem', opacity: 0.5, fontStyle: 'italic', margin: '2.5rem 0', lineHeight: 1.7 }}>
        The schedule is still taking shape — events will appear here as they're confirmed.
      </p>
    )
  }

  return (
    <div>
      {/* Time-based calendar grid */}
      {isMobile ? (
        // ── Mobile: day tab picker + single column ──
        <div>
          {/* Wrap (not scroll): every day tab stays visible on narrow phones —
              a hidden-scroll rail made SUN/MON undiscoverable at ~390px */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {days.map(day => {
              const active = selectedDay === day.iso
              return (
                <button
                  key={day.iso}
                  onClick={() => setSelectedDay(day.iso)}
                  style={{
                    flexShrink: 0,
                    padding: '0.4rem 0.9rem',
                    borderRadius: '9999px',
                    border: `1px solid ${active ? 'rgb(var(--gold-rgb) / 0.7)' : 'rgb(var(--gold-rgb) / 0.2)'}`,
                    background: active ? 'rgb(var(--gold-rgb) / 0.1)' : 'transparent',
                    color: active ? 'var(--gold)' : 'rgb(var(--gold-rgb) / 0.5)',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    letterSpacing: '0.08em',
                    fontWeight: active ? 700 : 400,
                    textAlign: 'center',
                    lineHeight: 1.4,
                  }}
                >
                  <span style={{ display: 'block' }}>{day.short}</span>
                  <span style={{ display: 'block', fontSize: '0.65rem', opacity: 0.8 }}>{day.month} {day.date}</span>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: '0' }}>
            {/* Time axis */}
            <div style={{ width: '44px', flexShrink: 0, position: 'relative', height: TOTAL_HEIGHT, marginTop: '0' }}>
              {HOUR_LABELS.map(({ hour, label }) => (
                <div key={hour} style={{
                  position: 'absolute',
                  top: (hour - START_HOUR) * PX_PER_HOUR - 7,
                  left: 0, right: '6px',
                  fontSize: '0.58rem', color: 'var(--gold)',
                  opacity: label === 'Midnight' || label === 'Noon' ? 0.7 : 0.35,
                  whiteSpace: 'nowrap', textAlign: 'right',
                  letterSpacing: '0.02em',
                  fontWeight: label === 'Midnight' || label === 'Noon' ? 600 : 400,
                }}>{label}</div>
              ))}
            </div>
            {/* Single day column */}
            <div style={{ flex: 1, position: 'relative', height: TOTAL_HEIGHT, border: '1px solid rgb(var(--gold-rgb) / 0.12)', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.01)', overflow: 'visible' }}>
              {HOUR_LABELS.map(({ hour, label }) => (
                <div key={hour} style={{
                  position: 'absolute', top: (hour - START_HOUR) * PX_PER_HOUR, left: 0, right: 0,
                  borderTop: `1px solid rgb(var(--gold-rgb) / ${label === 'Midnight' || label === 'Noon' ? '0.15' : '0.06'})`,
                }} />
              ))}
              {[...regular.filter(e => columnIso(e) === selectedDay), ...recurringOn(selectedDay)].map(ev => {
                const { start, end } = place(ev)
                if (start === null) return null
                const top = minutesToTop(start, START_HOUR)
                const height = end ? minutesToHeight(start, end, START_HOUR, END_HOUR) : Math.max(PX_PER_HOUR * 0.75, 32)
                return <EventBlock key={`${ev.id}-${selectedDay}`} event={ev} top={top} height={height} />
              })}
            </div>
          </div>
        </div>
      ) : (
        // ── Desktop: all 6 day columns ──
        <div style={{ display: 'flex', gap: '0' }}>
          <div style={{ width: '44px', flexShrink: 0, position: 'relative', height: TOTAL_HEIGHT, marginTop: '52px' }}>
            {HOUR_LABELS.map(({ hour, label }) => (
              <div key={hour} style={{
                position: 'absolute',
                top: (hour - START_HOUR) * PX_PER_HOUR - 7,
                left: 0, right: '6px',
                fontSize: '0.58rem', color: 'var(--gold)',
                opacity: label === 'Midnight' || label === 'Noon' ? 0.7 : 0.35,
                whiteSpace: 'nowrap', textAlign: 'right',
                letterSpacing: '0.02em',
                fontWeight: label === 'Midnight' || label === 'Noon' ? 600 : 400,
              }}>{label}</div>
            ))}
          </div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, 1fr)`, gap: '0.4rem' }}>
            {days.map(day => {
              const dayEvents = [...regular.filter(e => columnIso(e) === day.iso), ...recurringOn(day.iso)]
              return (
                <div key={day.iso}>
                  <div style={{
                    height: '52px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '0.5rem 0.5rem 0 0',
                    background: 'rgb(var(--gold-rgb) / 0.07)',
                    border: '1px solid rgb(var(--gold-rgb) / 0.2)',
                    borderBottom: 'none',
                  }}>
                    <p style={{ fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.6, margin: 0 }}>{day.short} · {day.month}</p>
                    <p style={{ fontSize: '1rem', color: 'var(--cream)', margin: '0.1rem 0 0', fontFamily: 'var(--font-display)' }}>{day.date}</p>
                  </div>
                  <div style={{
                    position: 'relative', height: TOTAL_HEIGHT,
                    border: '1px solid rgb(var(--gold-rgb) / 0.12)',
                    borderRadius: '0 0 0.5rem 0.5rem',
                    background: 'rgba(255,255,255,0.01)', overflow: 'visible',
                  }}>
                    {HOUR_LABELS.map(({ hour, label }) => (
                      <div key={hour} style={{
                        position: 'absolute', top: (hour - START_HOUR) * PX_PER_HOUR, left: 0, right: 0,
                        borderTop: `1px solid rgb(var(--gold-rgb) / ${label === 'Midnight' || label === 'Noon' ? '0.15' : '0.06'})`,
                      }} />
                    ))}
                    {dayEvents.map(ev => {
                      const { start, end } = place(ev)
                      if (start === null) return null
                      const top = minutesToTop(start, START_HOUR)
                      const height = end ? minutesToHeight(start, end, START_HOUR, END_HOUR) : Math.max(PX_PER_HOUR * 0.75, 32)
                      return <EventBlock key={`${ev.id}-${day.iso}`} event={ev} top={top} height={height} />
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Untimed events */}
      {untimed.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <p style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.5, marginBottom: '0.75rem' }}>No fixed time</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {untimed.map(ev => (
              <div key={ev.id} style={{ padding: '0.4rem 0.75rem', border: '1px solid rgb(var(--gold-rgb) / 0.15)', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.02)' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--cream)', margin: 0 }}>{ev.day} · {ev.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Every Day — recurring events without picked dates (compact) */}
      {everyDay.length > 0 && (
        <div style={{ marginTop: '2.5rem' }}>
          <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.2), transparent)', marginBottom: '2rem' }} />
          <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.62rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.65 }}>
              ✦ &nbsp;Every Day&nbsp; ✦
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {everyDay.map(ev => <RecurringEventCard key={ev.id} event={ev} />)}
          </div>
        </div>
      )}

      {/* Event Details cards */}
      {regular.length > 0 && (
        <div style={{ marginTop: '3rem' }}>
          <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.2), transparent)', marginBottom: '2.5rem' }} />
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <p style={{ fontSize: '0.65rem', letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7 }}>
              ✦ &nbsp;Event Details&nbsp; ✦
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
            {regular.filter((card, i, arr) => arr.findIndex(c => c.title === card.title) === i).map(card => {
              // A late-night card is labelled by the night it belongs to
              // ("Saturday night"), not its true morning date's weekday.
              const p = place(card)
              const dayLabel = p.lateNight
                ? `${days.find(d => d.iso === p.displayDate)?.label ?? card.day} night`
                : card.day
              return (
              <div key={card.id} style={{ padding: '1.25rem', border: '1px solid rgb(var(--gold-rgb) / 0.15)', borderRadius: '0.85rem', background: 'rgb(var(--gold-rgb) / 0.03)', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxShadow: card.highlight ? '0 0 18px rgb(var(--gold-rgb) / 0.3), 0 0 40px rgb(var(--gold-rgb) / 0.1)' : undefined }}>
                <p style={{ fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.85, margin: 0, textAlign: 'center' }}>
                  {dayLabel}&nbsp;&nbsp;{card.time}
                </p>
                <div style={{ color: 'var(--gold)', opacity: 0.55, display: 'flex', justifyContent: 'center', flex: 1, alignItems: 'center' }}>
                  <EventIcon type={card.icon_type} size={card.icon_type.startsWith('http') || card.icon_type.startsWith('/') ? 72 : 38} />
                </div>
                <div style={{ marginTop: 'auto' }}>
                  <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--cream)', margin: '0 0 0.4rem', textAlign: 'center' }}>{card.title}</p>
                  {card.detail_desc && <p style={{ fontSize: '0.85rem', lineHeight: 1.65, opacity: 0.6, margin: 0, textAlign: 'center' }}>{card.detail_desc}</p>}
                </div>
              </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

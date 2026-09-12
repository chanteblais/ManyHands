'use client'

import { useId, useState, useEffect } from 'react'
import { MANDATORY_HUE, shiftHue } from '@/lib/shift-colors'
import { firstIsoByWeekday, type ScheduleDay } from '@/lib/schedule-days'
import { displayPlacement } from '@/lib/late-night'

export type PersonalEvent = {
  id: string
  day: string
  time: string
  title: string
  subtitle: string | null
  detail_desc: string | null
  icon_type: string
  highlight: boolean
  event_date?: string | null
  participation_type?: string | null
  shift_color_index?: number | null
  isPersonal: boolean
}

// Day columns come from the member's events' real dates (lib/schedule-days.ts,
// built by PersonalSchedule) — replaces the old hardcoded July list, whose date
// numbers had drifted a day off reality.

const PX_PER_HOUR = 40
const GOLD = 'var(--gold)'
const CREAM = '#F3EAE5'
const PANEL_BG = 'radial-gradient(circle at 50% 0%, rgba(92, 28, 110, 0.24), rgba(15, 0, 28, 0.94) 46%, rgba(8, 0, 18, 0.98) 100%)'
const GRID_LINE = 'rgb(var(--gold-rgb) / 0.12)'

// Times + column via the shared late-night convention (lib/late-night.ts):
// overnight ends wrap, and an event starting before 6 AM renders past midnight
// in the PREVIOUS night's column — same placement as the full /schedule grid.
function place(e: Pick<PersonalEvent, 'time' | 'event_date'>) {
  return displayPlacement(e.time, e.event_date ?? null)
}

type EventColors = { border: string; bg: string; time: string; title: string; subtitle: string; label?: string }

// Mandatory events = everyone attends (not a personal shift).
const isMandatory = (ev: PersonalEvent) => ev.participation_type === 'mandatory'

function eventColors(ev: PersonalEvent): EventColors {
  const label = ev.isPersonal && !isMandatory(ev) ? 'Your Shift' : undefined
  if (isMandatory(ev)) {
    return { border: '#5FA58E', bg: 'linear-gradient(145deg, rgba(13,50,72,0.9), rgba(11,27,50,0.92))', time: '#76C7B2', title: CREAM, subtitle: '#AD759A', label }
  }
  // Shift events tint the dark card with their shift type's palette hue.
  if (ev.participation_type === 'shift' && ev.shift_color_index != null) {
    const hue = shiftHue(ev.shift_color_index)
    return {
      border: `rgba(${hue.rgb},0.8)`,
      bg: `linear-gradient(145deg, rgba(${hue.rgb},0.22), rgba(18,4,28,0.94))`,
      time: hue.accent, title: CREAM, subtitle: hue.accent, label,
    }
  }
  return { border: '#8F329D', bg: 'linear-gradient(145deg, rgba(59,7,78,0.9), rgba(32,4,52,0.96))', time: '#C86BD0', title: CREAM, subtitle: '#C49AC1', label }
}

function EventCard({ event, top, height }: { event: PersonalEvent; top: number; height: number }) {
  const c = eventColors(event)
  const tall = height >= 66
  const isPersonalShift = event.isPersonal && !isMandatory(event)

  return (
    <div style={{
      position: 'absolute', top, height,
      left: '10px', right: '10px',
      borderRadius: '8px',
      border: `1.5px solid ${c.border}`,
      background: c.bg,
      padding: tall ? '10px 12px' : '6px 10px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      boxShadow: isPersonalShift
        ? `0 0 20px rgba(182,80,200,0.28), inset 0 0 24px rgba(20,0,30,0.35)`
        : `inset 0 0 20px rgba(0,0,0,0.22), 0 0 10px rgba(0,0,0,0.12)`,
    }}>
      {event.time && (
        <p style={{ fontSize: '0.52rem', color: c.time, margin: `0 0 ${tall ? 9 : 4}px`, letterSpacing: '0.02em', lineHeight: 1.1, fontWeight: 600, textAlign: 'center', textShadow: '0 1px 0 rgba(0,0,0,0.45)' }}>
          {event.time}
        </p>
      )}
      <p style={{ fontSize: tall ? '0.65rem' : '0.56rem', fontWeight: 700, color: c.title, margin: 0, lineHeight: 1.2, wordBreak: 'break-word', textAlign: 'center', textShadow: '0 1px 0 rgba(0,0,0,0.75)' }}>
        {event.title}
      </p>
      {event.subtitle && tall && (
        <p style={{ fontSize: '0.54rem', color: c.subtitle, margin: '11px 0 0', lineHeight: 1.3, fontWeight: 500, textAlign: 'center', textShadow: '0 1px 0 rgba(0,0,0,0.5)' }}>
          {event.subtitle}
        </p>
      )}
      {c.label && tall && (
        <p style={{ fontSize: '0.58rem', color: c.subtitle, margin: '13px 0 0', letterSpacing: '0.02em', opacity: 0.98, textAlign: 'center', fontWeight: 600, textShadow: '0 1px 0 rgba(0,0,0,0.45)' }}>
          {c.label}
        </p>
      )}
      {isPersonalShift && tall && height >= 100 && (
        <p style={{ fontSize: '1.15rem', color: GOLD, opacity: 0.82, margin: '26px 0 0', lineHeight: 1, textAlign: 'center', textShadow: '0 0 12px rgb(var(--gold-rgb) / 0.45)' }}>✦</p>
      )}
    </div>
  )
}

function buildTimeWindow(events: PersonalEvent[]) {
  const allMinutes: number[] = []
  events.filter(e => !!e.time).forEach(e => {
    const { start, end } = place(e)
    if (start != null) allMinutes.push(start)
    if (end != null) allMinutes.push(end)
  })
  const PADDING = 30
  const minMin = allMinutes.length ? Math.min(...allMinutes) - PADDING : 8 * 60
  const maxMin = allMinutes.length ? Math.max(...allMinutes) + PADDING : 22 * 60
  const START_HOUR = Math.floor(minMin / 60)
  const END_HOUR = Math.ceil(maxMin / 60)

  const hourLabels: { hour: number; label: string }[] = []
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    const d = h % 24
    if (d === 12) { hourLabels.push({ hour: h, label: 'NOON' }); continue }
    if (d === 0)  { hourLabels.push({ hour: h, label: 'MIDN' }); continue }
    const h12 = d > 12 ? d - 12 : d
    const ampm = d < 12 ? 'AM' : 'PM'
    hourLabels.push({ hour: h, label: `${h12} ${ampm}` })
  }

  return { START_HOUR, END_HOUR, TOTAL_HEIGHT: (END_HOUR - START_HOUR) * PX_PER_HOUR, hourLabels }
}

function SingleDayGrid({ dayEvents, allEvents }: { dayEvents: PersonalEvent[]; allEvents: PersonalEvent[] }) {
  const { START_HOUR, END_HOUR, TOTAL_HEIGHT, hourLabels } = buildTimeWindow(allEvents)
  const timed = dayEvents.filter(e => !!e.time)

  return (
    <div style={{ display: 'flex', gap: '0' }}>
      <div style={{ width: '46px', flexShrink: 0, position: 'relative', height: TOTAL_HEIGHT, marginTop: '44px', borderRight: '1px solid rgb(var(--gold-rgb) / 0.14)' }}>
        {hourLabels.map(({ hour, label }) => (
          <div key={hour} style={{
            position: 'absolute', top: (hour - START_HOUR) * PX_PER_HOUR - 7, right: '10px',
            fontSize: '0.6rem', color: GOLD,
            opacity: label === 'NOON' || label === 'MIDN' ? 0.8 : 0.4,
            whiteSpace: 'nowrap', textAlign: 'right', letterSpacing: '0.04em',
            fontWeight: label === 'NOON' ? 600 : 400,
          }}>{label}</div>
        ))}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ height: '44px', borderBottom: `1px solid ${GRID_LINE}` }} />
        <div style={{ position: 'relative', height: TOTAL_HEIGHT, background: 'linear-gradient(180deg, rgba(255,255,255,0.012), rgba(255,255,255,0.004))' }}>
          {hourLabels.map(({ hour, label }) => (
            <div key={hour} style={{
              position: 'absolute', top: (hour - START_HOUR) * PX_PER_HOUR, left: 0, right: 0,
              borderTop: `1px solid rgb(var(--gold-rgb) / ${label === 'NOON' ? '0.18' : '0.08'})`,
            }} />
          ))}
          {timed.map(ev => {
            const { start, end } = place(ev)
            if (start === null) return null
            const top = ((start / 60) - START_HOUR) * PX_PER_HOUR
            const height = end
              ? Math.max((Math.min(end / 60, END_HOUR) - Math.max(start / 60, START_HOUR)) * PX_PER_HOUR, 36)
              : Math.max(PX_PER_HOUR * 0.85, 40)
            return <EventCard key={ev.id} event={ev} top={top} height={height} />
          })}
        </div>
      </div>
    </div>
  )
}

export function PersonalScheduleCalendar({ events, days }: { events: PersonalEvent[]; days: ScheduleDay[] }) {
  const [collapsed, setCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const rawId = useId()
  const calendarId = `personal-schedule-${rawId.replace(/:/g, '')}`

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const timed = events.filter(e => !!e.time)
  const untimed = events.filter(e => !e.time)
  // Undated legacy rows fall back to the first column matching their weekday name.
  const weekdayIso = firstIsoByWeekday(days)
  const columnIso = (e: PersonalEvent): string | null => place(e).displayDate ?? weekdayIso[e.day] ?? null
  const activeDays = days.filter(d => events.some(e => columnIso(e) === d.iso))
  const activeDay = selectedDay ?? activeDays[0]?.iso ?? null

  if (activeDays.length === 0 && untimed.length === 0) return null

  const { START_HOUR, END_HOUR, TOTAL_HEIGHT, hourLabels } = buildTimeWindow(events)

  return (
    <div style={{
      marginBottom: '2.5rem',
      border: `1.5px solid ${GOLD}`,
      borderRadius: '1rem',
      background: PANEL_BG,
      overflow: 'hidden',
      boxShadow: '0 0 0 1px rgb(var(--gold-rgb) / 0.18), 0 0 28px rgba(182,80,200,0.12), inset 0 0 40px rgba(182,80,200,0.06)',
    }}>
      <button
        onClick={() => setCollapsed(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.75rem 2rem 0.65rem',
          background: 'none', border: 'none', borderBottom: collapsed ? 'none' : '1px solid rgb(var(--gold-rgb) / 0.24)',
          cursor: 'pointer', color: 'inherit',
        }}
      >
        <span style={{ width: '1.25rem', flexShrink: 0 }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', color: GOLD, letterSpacing: '0.16em', textShadow: '0 1px 0 rgba(0,0,0,0.75), 0 0 18px rgb(var(--gold-rgb) / 0.28)' }}>
            Your Schedule
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: GOLD, opacity: 0.72, width: '1.25rem', textAlign: 'right', flexShrink: 0 }}>
          {collapsed ? '▼' : '▲'}
        </span>
      </button>

      {!collapsed && (
        <div style={{ padding: '1.15rem 1.25rem 0' }}>

          {isMobile ? (
            <>
              {/* Day tab bar */}
              {activeDays.length > 1 && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                  {activeDays.map(day => {
                    const active = activeDay === day.iso
                    return (
                      <button
                        key={day.iso}
                        onClick={() => setSelectedDay(day.iso)}
                        style={{
                          flexShrink: 0,
                          padding: '0.4rem 0.9rem',
                          borderRadius: '9999px',
                          border: `1px solid ${active ? 'rgb(var(--gold-rgb) / 0.7)' : 'rgb(var(--gold-rgb) / 0.2)'}`,
                          background: active ? 'rgb(var(--gold-rgb) / 0.12)' : 'transparent',
                          color: active ? GOLD : 'rgb(var(--gold-rgb) / 0.5)',
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          letterSpacing: '0.1em',
                          fontWeight: active ? 700 : 400,
                          textAlign: 'center',
                          lineHeight: 1.4,
                        }}
                      >
                        <span style={{ display: 'block' }}>{day.short}</span>
                        <span style={{ display: 'block', fontSize: '0.65rem', opacity: 0.8 }}>{day.date}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              {activeDay && (
                <SingleDayGrid
                  dayEvents={events.filter(e => columnIso(e) === activeDay)}
                  allEvents={events}
                />
              )}
            </>
          ) : (
            <>
              <style dangerouslySetInnerHTML={{ __html: `
                @media (max-width: 760px) {
                  #${calendarId} .schedule-scroll { overflow-x: auto; padding-bottom: 0.5rem; }
                  #${calendarId} .schedule-grid   { min-width: ${Math.max(activeDays.length * 168 + 46, 560)}px; }
                }
              ` }} />
              <div id={calendarId} className="schedule-scroll">
                <div className="schedule-grid" style={{ display: 'flex', gap: '0' }}>
                  <div style={{ width: '46px', flexShrink: 0, position: 'relative', height: TOTAL_HEIGHT, marginTop: '44px', borderRight: '1px solid rgb(var(--gold-rgb) / 0.14)' }}>
                    {hourLabels.map(({ hour, label }) => (
                      <div key={hour} style={{
                        position: 'absolute', top: (hour - START_HOUR) * PX_PER_HOUR - 7, right: '10px',
                        fontSize: '0.6rem', color: GOLD,
                        opacity: label === 'NOON' || label === 'MIDN' ? 0.8 : 0.4,
                        whiteSpace: 'nowrap', textAlign: 'right', letterSpacing: '0.04em',
                        fontWeight: label === 'NOON' ? 600 : 400,
                      }}>{label}</div>
                    ))}
                  </div>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${activeDays.length}, minmax(168px, 1fr))`, gap: '0' }}>
                    {activeDays.map(day => {
                      const dayEvents = timed
                        .filter(e => columnIso(e) === day.iso)
                        .sort((a, b) => (place(a).start ?? 0) - (place(b).start ?? 0))
                      return (
                        <div key={day.iso}>
                          <div style={{
                            height: '44px', textAlign: 'center',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            paddingBottom: '6px',
                            borderLeft: '1px solid rgb(var(--gold-rgb) / 0.16)',
                            borderBottom: `1px solid ${GRID_LINE}`,
                          }}>
                            <span style={{ fontSize: '0.8rem', letterSpacing: '0.11em', color: GOLD, opacity: 0.94, fontWeight: 700, textShadow: '0 1px 0 rgba(0,0,0,0.7)' }}>{day.short}</span>
                            <span style={{ fontSize: '0.72rem', letterSpacing: '0.05em', color: GOLD, opacity: 0.78, marginTop: '1px', fontWeight: 500, textShadow: '0 1px 0 rgba(0,0,0,0.7)' }}>{day.month} {day.date}</span>
                          </div>
                          <div style={{
                            position: 'relative', height: TOTAL_HEIGHT,
                            borderLeft: '1px solid rgb(var(--gold-rgb) / 0.16)',
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.012), rgba(255,255,255,0.004))',
                          }}>
                            {hourLabels.map(({ hour, label }) => (
                              <div key={hour} style={{
                                position: 'absolute', top: (hour - START_HOUR) * PX_PER_HOUR, left: 0, right: 0,
                                borderTop: `1px solid rgb(var(--gold-rgb) / ${label === 'NOON' ? '0.18' : '0.08'})`,
                              }} />
                            ))}
                            {dayEvents.map(ev => {
                              const { start, end } = place(ev)
                              if (start === null) return null
                              const top = ((start / 60) - START_HOUR) * PX_PER_HOUR
                              const height = end
                                ? Math.max((Math.min(end / 60, END_HOUR) - Math.max(start / 60, START_HOUR)) * PX_PER_HOUR, 36)
                                : Math.max(PX_PER_HOUR * 0.85, 40)
                              return <EventCard key={ev.id} event={ev} top={top} height={height} />
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {untimed.length > 0 && (
            <div style={{ marginTop: '1.1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {untimed.map(ev => (
                <div key={ev.id} style={{ padding: '0.42rem 0.8rem', border: '1px solid rgb(var(--gold-rgb) / 0.28)', borderRadius: '7px', background: 'rgb(var(--gold-rgb) / 0.06)' }}>
                  <span style={{ fontSize: '0.78rem', color: GOLD, opacity: 0.8 }}>{ev.day} · {ev.title}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: '1rem 0 1.15rem', marginTop: '1rem', borderTop: '1px solid rgb(var(--gold-rgb) / 0.13)' }}>
            <a href="/schedule" style={{ fontSize: '0.78rem', color: '#E37AE9', opacity: 0.92, textDecoration: 'none', letterSpacing: '0.03em', fontWeight: 700, textShadow: '0 0 14px rgba(227,122,233,0.28)' }}>
              View full calendar →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

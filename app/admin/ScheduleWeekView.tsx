'use client'

// Admin week view for the at-camp schedule — time as space. Day columns ×
// vertical hour axis (the same visual language as the member calendar,
// components/ScheduleCalendarClient.tsx: same hour scale, same shift-type
// hues), with admin interactions on top: click a block to edit it, click an
// empty slot to add an event with that date + time prefilled, and drag a block
// to reschedule it — vertical moves the time (15-minute snap, duration kept),
// crossing columns moves the day. Overlaps and gaps that are invisible in the
// list view jump out here.
//
// Recurring events render as ghosted bands in each column they repeat on
// (recurrence_days NULL = every day) — context, not clutter. A ghost's body is
// click-through (it would otherwise swallow add-at-slot clicks across every
// column it spans) but its text label still opens the editor. Dated events
// missing a parseable time surface in a fix-me strip below.

import { useRef, useState } from 'react'
import { MANDATORY_HUE, shiftHue, shiftColorIndexMap, generalHue } from '@/lib/shift-colors'
import { parseHHMM, formatShiftRange } from '@/lib/shift-hours'
import { rangeTo24h } from '@/lib/time-format'
import { lateNightShift, lateNightDisplayDate, addDays } from '@/lib/late-night'
import type { ScheduleDay } from '@/lib/schedule-days'

// Structural subset of the manager's ScheduleEvent — everything the grid needs.
type WeekViewEvent = {
  id: string
  title: string
  time: string
  event_date: string | null
  is_recurring: boolean
  visible: boolean
  highlight: boolean
  participation_type: 'general' | 'shift' | 'mandatory'
  shift_type_id: string | null
  needs_lead: boolean
  capacity: number | null
  start_time: string | null
  end_time: string | null
  recurrence_days: string[] | null
}

type RosterEntry = { role: 'member' | 'lead'; occurrence_date: string | null }

const PX_PER_HOUR = 56
const GOLD = 'var(--gold)'
const HEADER_H = 46 // day-column header height — the hour grid starts below it
const DRAG_SNAP_MIN = 15

// Minutes-from-midnight → "HH:MM" (mod 24h, so an overnight block's end wraps).
function toHHMM(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Minutes from midnight, structured times first, legacy free text as fallback.
// Late-night convention (lib/late-night.ts): a start before 6 AM renders at
// hour 24+ — in the PREVIOUS night's column for dated events (displayIso).
function eventMinutes(e: WeekViewEvent): { start: number | null; end: number | null } {
  const legacy = rangeTo24h(e.time)
  const start = parseHHMM(e.start_time) ?? parseHHMM(legacy.start)
  let end = parseHHMM(e.end_time) ?? parseHHMM(legacy.end)
  // Midnight end / overnight: keep the block growing downward, not negative.
  if (start != null && end != null && end <= start) end += 24 * 60
  const shifted = lateNightShift({ start, end })
  return { start: shifted.start, end: shifted.end }
}

// The column a dated event displays in — its own date, or the previous day's
// column when it starts before 6 AM (event_date stays the true morning date).
function displayIso(e: WeekViewEvent): string | null {
  if (!e.event_date) return null
  const legacy = rangeTo24h(e.time)
  return lateNightDisplayDate(e.event_date, parseHHMM(e.start_time) ?? parseHHMM(legacy.start))
}

function hue(e: WeekViewEvent, shiftIndex: Record<string, number>) {
  if (e.participation_type === 'mandatory') return MANDATORY_HUE
  if (e.participation_type === 'shift' && e.shift_type_id != null && shiftIndex[e.shift_type_id] != null) {
    return shiftHue(shiftIndex[e.shift_type_id])
  }
  // General (incl. recurring) → the event's own stable hue, same as members
  // see on the calendar. (Recurring purple stays chrome-only — as a block
  // colour it collided with magenta shift types.)
  return generalHue(e.id)
}

// Side-by-side lanes for overlapping events in one column. Greedy: sorted by
// start, each event takes the first lane that's free; a cluster of transitive
// overlaps shares the column width across its lane count.
function layoutLanes(evs: { id: string; start: number; end: number }[]): Record<string, { lane: number; lanes: number }> {
  const sorted = [...evs].sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Record<string, { lane: number; lanes: number }> = {}
  const laneEnds: number[] = []
  let cluster: string[] = []
  let clusterEnd = -1
  const closeCluster = () => {
    const lanes = Math.max(...cluster.map(id => out[id].lane)) + 1
    for (const id of cluster) out[id].lanes = lanes
    cluster = []
    laneEnds.length = 0
  }
  for (const ev of sorted) {
    if (cluster.length > 0 && ev.start >= clusterEnd) closeCluster()
    let lane = laneEnds.findIndex(end => end <= ev.start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = ev.end
    out[ev.id] = { lane, lanes: 1 }
    cluster.push(ev.id)
    clusterEnd = Math.max(clusterEnd, ev.end)
  }
  if (cluster.length > 0) closeCluster()
  return out
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

export function ScheduleWeekView({ events, days, shiftTypes, rosters, onEdit, onAddAt, onMove }: {
  events: WeekViewEvent[]
  days: ScheduleDay[]
  shiftTypes: { id: string; name: string }[]
  rosters: Record<string, RosterEntry[]>
  onEdit: (id: string) => void
  onAddAt: (dateIso: string, startTime: string) => void
  onMove: (id: string, dateIso: string, startTime: string, endTime: string | null) => void
}) {
  const shiftIndex = shiftColorIndexMap(shiftTypes)
  const dated = events.filter(e => !e.is_recurring && e.event_date)
  const recurring = events.filter(e => e.is_recurring)
  const untimed = dated.filter(e => eventMinutes(e).start == null)

  // Axis window from actual times (recurring included — their bands need to
  // fit), padded and rounded to the hour; sane default when nothing is timed.
  const allMinutes: number[] = []
  for (const e of [...dated, ...recurring]) {
    const { start, end } = eventMinutes(e)
    if (start != null) allMinutes.push(start)
    if (end != null) allMinutes.push(end)
  }
  const START_HOUR = allMinutes.length ? Math.floor((Math.min(...allMinutes) - 30) / 60) : 8
  const END_HOUR = allMinutes.length ? Math.ceil((Math.max(...allMinutes) + 30) / 60) : 23
  const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * PX_PER_HOUR
  const HOUR_LABELS = buildHourLabels(START_HOUR, END_HOUR)

  // Click an empty slot → add prefilled with the day + nearest half-hour.
  // A slot past the Midnight line is late night: the stored date is the NEXT
  // morning (true calendar date); the block still displays in this column.
  const slotClick = (iso: string) => (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mins = START_HOUR * 60 + ((e.clientY - rect.top) / PX_PER_HOUR) * 60
    const snapped = Math.max(0, Math.min(Math.round(mins / 30) * 30, END_HOUR * 60 - 30))
    const clock = snapped % (24 * 60)
    onAddAt(snapped >= 24 * 60 ? addDays(iso, 1) : iso, `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`)
  }

  // Drag-to-reschedule. Pointer events (not HTML5 drag-and-drop) so the block
  // tracks the cursor with grid snapping and works on touch. A press only
  // becomes a drag past a small movement threshold — below it, pointerup is a
  // plain click and opens the editor as before. The live position lives in
  // `drag` (state, drives the preview block); the rest of the gesture lives in
  // a ref so pointermove doesn't depend on stale closures.
  const [drag, setDrag] = useState<{ id: string; dayIdx: number; startMin: number; durMin: number | null } | null>(null)
  const dragRef = useRef<{
    id: string; pointerId: number; downX: number; downY: number
    durMin: number | null; grabOffsetMin: number
    origDayIdx: number; origStartMin: number
    lastDayIdx: number; lastStartMin: number; active: boolean
  } | null>(null)
  const colsRef = useRef<HTMLDivElement>(null) // the day-columns grid, for pointer → day/time math
  const suppressClick = useRef(false) // eat the click that fires right after a drag ends

  // Pointer coordinates → (day column, snapped start minute). The column comes
  // from X across the grid (the 0.4rem gaps are negligible next to a column);
  // the minute from Y below the day headers, minus where in the block the
  // grab happened so the block doesn't jump to the cursor.
  const dragPos = (clientX: number, clientY: number, d: { grabOffsetMin: number; durMin: number | null }) => {
    const rect = colsRef.current!.getBoundingClientRect()
    const dayIdx = Math.max(0, Math.min(days.length - 1, Math.floor(((clientX - rect.left) / rect.width) * days.length)))
    const raw = START_HOUR * 60 + ((clientY - rect.top - HEADER_H) / PX_PER_HOUR) * 60 - d.grabOffsetMin
    const snapped = Math.round(raw / DRAG_SNAP_MIN) * DRAG_SNAP_MIN
    const startMin = Math.max(START_HOUR * 60, Math.min(snapped, END_HOUR * 60 - (d.durMin ?? 45)))
    return { dayIdx, startMin }
  }

  const dragHandlers = (ev: WeekViewEvent, startMin: number, endMin: number | null) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const origDayIdx = days.findIndex(d => d.iso === displayIso(ev))
      if (origDayIdx === -1) return
      const rect = e.currentTarget.getBoundingClientRect()
      dragRef.current = {
        id: ev.id, pointerId: e.pointerId, downX: e.clientX, downY: e.clientY,
        durMin: endMin != null ? endMin - startMin : null,
        grabOffsetMin: ((e.clientY - rect.top) / PX_PER_HOUR) * 60,
        origDayIdx, origStartMin: startMin,
        lastDayIdx: origDayIdx, lastStartMin: startMin, active: false,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d || d.id !== ev.id || e.pointerId !== d.pointerId) return
      if (!d.active) {
        if (Math.abs(e.clientX - d.downX) + Math.abs(e.clientY - d.downY) < 5) return
        d.active = true
      }
      const pos = dragPos(e.clientX, e.clientY, d)
      d.lastDayIdx = pos.dayIdx
      d.lastStartMin = pos.startMin
      setDrag({ id: d.id, dayIdx: pos.dayIdx, startMin: pos.startMin, durMin: d.durMin })
    },
    onPointerUp: () => {
      const d = dragRef.current
      dragRef.current = null
      if (!d || d.id !== ev.id) return
      setDrag(null)
      if (!d.active) return // plain click — the onClick handler opens the editor
      suppressClick.current = true
      if (d.lastDayIdx === d.origDayIdx && d.lastStartMin === d.origStartMin) return
      // Dropped past the Midnight line = late night of that column: the stored
      // date is the next morning (the display maps it back to this column).
      const lateNight = d.lastStartMin >= 24 * 60
      onMove(
        ev.id,
        lateNight ? addDays(days[d.lastDayIdx].iso, 1) : days[d.lastDayIdx].iso,
        toHHMM(d.lastStartMin),
        d.durMin != null ? toHHMM(d.lastStartMin + d.durMin) : null,
      )
    },
    onPointerCancel: () => { dragRef.current = null; setDrag(null) },
  })

  const block = (ev: WeekViewEvent, ghost: boolean, dayIso: string, lane = 0, lanes = 1) => {
    const { start, end } = eventMinutes(ev)
    if (start == null) return null
    const h = hue(ev, shiftIndex)
    const top = ((start / 60) - START_HOUR) * PX_PER_HOUR
    const endMin = end ?? start + 45
    const height = Math.max((Math.min(endMin, END_HOUR * 60) - start) / 60 * PX_PER_HOUR, 26)
    // Each night of a recurring shift is its own regular shift — count only the
    // holds on this column's night (non-recurring holds carry occurrence NULL),
    // matching how the member-facing picker keys holds (lib/participate-data.ts).
    const roster = (rosters[ev.id] ?? []).filter(r =>
      ev.is_recurring ? r.occurrence_date === dayIso : r.occurrence_date == null,
    )
    const n = roster.length
    const noLead = ev.participation_type === 'shift' && ev.needs_lead && n > 0 && !roster.some(r => r.role === 'lead')
    const width = 100 / lanes
    const beingDragged = !ghost && drag?.id === ev.id
    return (
      <div
        key={ev.id}
        onClick={ghost ? undefined : e => {
          e.stopPropagation()
          if (suppressClick.current) { suppressClick.current = false; return }
          onEdit(ev.id)
        }}
        {...(ghost ? {} : dragHandlers(ev, start, end))}
        title={ghost ? undefined : `${ev.title}${ev.visible ? '' : ' (hidden)'} — click to edit · drag to reschedule`}
        style={{
          position: 'absolute',
          top,
          height,
          left: `calc(${lane * width}% + 2px)`,
          width: `calc(${width}% - 4px)`,
          borderRadius: '0.35rem',
          border: `1px ${!ev.visible || beingDragged ? 'dashed' : 'solid'} rgba(${h.rgb},${ghost ? 0.45 : 0.5})`,
          background: `rgba(${h.rgb},${ghost ? 0.08 : 0.1})`,
          opacity: beingDragged ? 0.3 : ev.visible ? (ghost ? 0.8 : 1) : 0.4,
          overflow: 'hidden',
          cursor: ghost ? undefined : beingDragged ? 'grabbing' : 'grab',
          // The ghost's BODY passes clicks through to the slot beneath — a band
          // spanning every repeat column must not hijack click-to-add. Its text
          // label (below) stays clickable, so the event itself is still one
          // click away.
          pointerEvents: ghost ? 'none' : undefined,
          // Blocks own their touches — otherwise the page scrolls instead of dragging.
          touchAction: ghost ? undefined : 'none',
          padding: '0.2rem 0.3rem',
          boxShadow: ev.highlight ? '0 0 10px rgb(var(--gold-rgb) / 0.35)' : undefined,
        }}
      >
        <div
          onClick={ghost ? e => { e.stopPropagation(); onEdit(ev.id) } : undefined}
          title={ghost ? `${ev.title}${ev.visible ? '' : ' (hidden)'} — recurring — click to edit` : undefined}
          style={ghost ? { pointerEvents: 'auto', cursor: 'pointer' } : undefined}
        >
          <p style={{ fontSize: '0.6rem', color: h.accent, margin: 0, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {ev.time}
          </p>
          <p style={{ fontSize: '0.66rem', color: 'var(--cream)', margin: '0.1rem 0 0', lineHeight: 1.25, fontWeight: 600, overflow: 'hidden' }}>
            {ev.title}
          </p>
          {ev.participation_type === 'shift' && (
            <p style={{ fontSize: '0.58rem', color: h.accent, margin: '0.1rem 0 0', opacity: 0.85, whiteSpace: 'nowrap' }}>
              {n}{ev.capacity != null ? `/${ev.capacity}` : ''} signed up{noLead ? ' · ✦ no lead' : ''}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Grid (horizontal scroll if the range is wide) */}
      <div style={{ overflowX: 'auto', paddingBottom: '0.5rem' }}>
        <div style={{ display: 'flex', minWidth: `${44 + days.length * 108}px` }}>
          {/* Hour axis */}
          <div style={{ width: '44px', flexShrink: 0, position: 'relative', height: TOTAL_HEIGHT, marginTop: '46px' }}>
            {HOUR_LABELS.map(({ hour, label }) => (
              <div key={hour} style={{
                position: 'absolute', top: (hour - START_HOUR) * PX_PER_HOUR - 7, left: 0, right: '6px',
                fontSize: '0.58rem', color: GOLD,
                opacity: label === 'Midnight' || label === 'Noon' ? 0.7 : 0.35,
                whiteSpace: 'nowrap', textAlign: 'right', letterSpacing: '0.02em',
                fontWeight: label === 'Midnight' || label === 'Noon' ? 600 : 400,
              }}>{label}</div>
            ))}
          </div>
          {/* Day columns */}
          <div ref={colsRef} style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, 1fr)`, gap: '0.4rem' }}>
            {days.map((day, dayIdx) => {
              const dayEvents = dated
                .filter(e => displayIso(e) === day.iso)
                .map(e => ({ e, m: eventMinutes(e) }))
                .filter((x): x is { e: WeekViewEvent; m: { start: number; end: number | null } } => x.m.start != null)
              const lanes = layoutLanes(dayEvents.map(({ e, m }) => ({ id: e.id, start: m.start, end: m.end ?? m.start + 45 })))
              return (
                <div key={day.iso}>
                  <div style={{
                    height: '46px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    borderRadius: '0.5rem 0.5rem 0 0', background: 'rgb(var(--gold-rgb) / 0.07)',
                    border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderBottom: 'none',
                  }}>
                    <p style={{ fontSize: '0.56rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, opacity: 0.6, margin: 0 }}>{day.short} · {day.month}</p>
                    <p style={{ fontSize: '0.92rem', color: 'var(--cream)', margin: '0.05rem 0 0', fontFamily: 'var(--font-display)' }}>{day.date}</p>
                  </div>
                  <div
                    onClick={slotClick(day.iso)}
                    title="Click an empty slot to add an event here"
                    style={{
                      position: 'relative', height: TOTAL_HEIGHT,
                      border: '1px solid rgb(var(--gold-rgb) / 0.12)', borderRadius: '0 0 0.5rem 0.5rem',
                      background: 'rgba(255,255,255,0.01)', cursor: 'copy',
                    }}
                  >
                    {HOUR_LABELS.map(({ hour, label }) => (
                      <div key={hour} style={{
                        position: 'absolute', top: (hour - START_HOUR) * PX_PER_HOUR, left: 0, right: 0,
                        borderTop: `1px solid rgb(var(--gold-rgb) / ${label === 'Midnight' || label === 'Noon' ? '0.15' : '0.06'})`,
                        pointerEvents: 'none',
                      }} />
                    ))}
                    {/* Recurring — ghosted context in each column the event repeats on
                        (recurrence_days NULL = every day) */}
                    {recurring.filter(ev => !ev.recurrence_days || ev.recurrence_days.includes(day.iso)).map(ev => block(ev, true, day.iso))}
                    {dayEvents.map(({ e }) => block(e, false, day.iso, lanes[e.id]?.lane ?? 0, lanes[e.id]?.lanes ?? 1))}
                    {/* Drag preview — the block's landing spot, live times in the corner */}
                    {drag && drag.dayIdx === dayIdx && (() => {
                      const ev = dated.find(e => e.id === drag.id)
                      if (!ev) return null
                      const h = hue(ev, shiftIndex)
                      return (
                        <div style={{
                          position: 'absolute',
                          top: ((drag.startMin / 60) - START_HOUR) * PX_PER_HOUR,
                          height: Math.max((drag.durMin ?? 45) / 60 * PX_PER_HOUR, 26),
                          left: '2px', right: '2px',
                          borderRadius: '0.35rem',
                          border: `1px solid ${h.accent}`,
                          background: `rgba(${h.rgb},0.22)`,
                          boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
                          pointerEvents: 'none', zIndex: 5,
                          overflow: 'hidden', padding: '0.2rem 0.3rem',
                        }}>
                          <p style={{ fontSize: '0.6rem', color: h.accent, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {formatShiftRange(toHHMM(drag.startMin), drag.durMin != null ? toHHMM(drag.startMin + drag.durMin) : null)}
                          </p>
                          <p style={{ fontSize: '0.66rem', color: 'var(--cream)', margin: '0.1rem 0 0', lineHeight: 1.25, fontWeight: 600, overflow: 'hidden' }}>
                            {ev.title}
                          </p>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Dated but untimed — can't sit on the grid until they get a time */}
      {untimed.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--danger)', opacity: 0.7, margin: '0 0 0.5rem' }}>
            No time yet — edit to place on the grid
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {untimed.map(ev => (
              <button key={ev.id} onClick={() => onEdit(ev.id)} style={{
                padding: '0.3rem 0.7rem', border: '1px dashed rgb(var(--danger-rgb) / 0.4)', borderRadius: '0.5rem',
                background: 'none', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.72rem', opacity: 0.8,
              }}>
                {ev.event_date} · {ev.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { EventIcon } from '@/components/EventIcon'
import { AssetImagePicker } from './AssetImagePicker'
import { LoadError } from './LoadError'
import { isImageIcon } from '@/lib/icon-src'
import { rangeTo24h } from '@/lib/time-format'
import { shiftDurationHours, formatShiftRange, parseHHMM, weekdayFromISO } from '@/lib/shift-hours'
import { LATE_NIGHT_BOUNDARY_MIN, lateNightDisplayDate, addDays } from '@/lib/late-night'
import { buildScheduleDays, type ScheduleDay } from '@/lib/schedule-days'
import { eventRangeDays } from '@/lib/shift-occurrences'
import { ScheduleWeekView } from './ScheduleWeekView'
import { useConfirm, useChoice } from '../components/ConfirmDialog'
import { TimeField } from '../components/TimeField'

export type ScheduleEvent = {
  id: string
  day: string
  time: string
  title: string
  subtitle: string | null
  detail_desc: string | null
  icon_type: string
  sort_order: number
  visible: boolean
  highlight: boolean
  is_recurring: boolean
  capacity: number | null
  event_date: string | null
  participation_type: 'general' | 'shift' | 'mandatory'
  shift_type_id: string | null
  requires_ack: boolean
  start_time: string | null
  end_time: string | null
  needs_lead: boolean
  // Recurring only: NULL = every day; an array of ISO dates = just those days.
  recurrence_days: string[] | null
  // Off = kept off the schedule page + home teaser (still signable/ackable).
  show_on_schedule: boolean
}

// Shift types offered when an event is a Shift (Configure → Shift Types registry).
export type ShiftTypeOption = { id: string; name: string }

// One holder of a shift, from GET /api/admin/schedule/rosters (member_shift_signups).
export type RosterEntry = { clerk_user_id: string; application_id: string | null; name: string; role: 'member' | 'lead'; occurrence_date: string | null }

// Weekday fallback order — only used to sort legacy UNDATED rows among themselves.
const DAY_ORDER: Record<string, number> = {
  Wednesday: 0, Thursday: 1, Friday: 2, Saturday: 3, Sunday: 4, Monday: 5, Tuesday: 6,
}

// "Jul 24" from an ISO occurrence date (roster night labels, recurrence chips,
// and the destroyed-signups warnings all speak the same date language).
const fmtNight = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Parse a time string like "7:00 PM" or "7:00 PM – 10:00 PM" to minutes since midnight
function parseStartMinutes(time: string): number {
  if (!time) return 9999
  const token = time.split(/[–—-]/)[0].trim()
  const m = token.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!m) {
    if (/midnight/i.test(token)) return 24 * 60
    if (/noon/i.test(token)) return 12 * 60
    return 9999
  }
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2] ?? '0', 10)
  const period = m[3]?.toLowerCase()
  if (period === 'pm' && h < 12) h += 12
  if (period === 'am' && h === 12) h = 0
  return h * 60 + min
}

// Time orders rows within a day; title breaks ties so the order is stable.
// Structured start_time wins; the free-text parse only covers legacy rows
// that haven't been re-saved (or backfilled by migration 054) yet.
function rawStartMinutes(e: ScheduleEvent): number {
  return parseHHMM(e.start_time) ?? parseStartMinutes(e.time)
}
// Late-night convention (lib/late-night.ts): a start before 6 AM sorts at
// hour 24+, i.e. at the end of the night it belongs to.
function startMinutes(e: ScheduleEvent): number {
  const raw = rawStartMinutes(e)
  return raw < LATE_NIGHT_BOUNDARY_MIN ? raw + 24 * 60 : raw
}
// The day group a dated event lists under — the previous day when it starts
// before 6 AM (its event_date stays the true morning date).
function displayIsoOf(e: ScheduleEvent): string | null {
  return e.event_date ? lateNightDisplayDate(e.event_date, rawStartMinutes(e)) : null
}
const isLateNight = (e: ScheduleEvent) => rawStartMinutes(e) < LATE_NIGHT_BOUNDARY_MIN
function sortByTime(evs: ScheduleEvent[]): ScheduleEvent[] {
  return [...evs].sort((a, b) =>
    startMinutes(a) - startMinutes(b) || a.title.localeCompare(b.title)
  )
}

const blank = (): Omit<ScheduleEvent, 'id' | 'sort_order'> => ({
  day: '', time: '', title: '', subtitle: '', detail_desc: '',
  icon_type: '/asset-library/icons/star.webp', visible: true, highlight: false, is_recurring: false, capacity: null, event_date: null, participation_type: 'general', shift_type_id: null, requires_ack: false, start_time: null, end_time: null, needs_lead: false, recurrence_days: null, show_on_schedule: true,
})

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.5rem', padding: '0.6rem 0.85rem', color: 'var(--cream)', fontSize: '0.875rem',
  fontFamily: 'var(--font-libre-baskerville), Georgia, serif', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--gold)', opacity: 0.65, display: 'block', marginBottom: '0.35rem',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: '1rem' }}><label style={labelStyle}>{label}</label>{children}</div>
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem', userSelect: 'none' }}>
      <span
        onClick={() => onChange(!checked)}
        style={{
          display: 'inline-block', width: '36px', height: '20px', borderRadius: '9999px', flexShrink: 0,
          background: checked ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
          border: `1px solid ${checked ? 'var(--gold)' : 'rgb(var(--gold-rgb) / 0.2)'}`,
          position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
        }}
      >
        <span style={{
          position: 'absolute', top: '2px', left: checked ? '17px' : '2px',
          width: '14px', height: '14px', borderRadius: '50%',
          background: 'var(--cream)', transition: 'left 0.2s',
        }} />
      </span>
      <span style={{ opacity: 0.75 }}>{label}</span>
    </label>
  )
}

function EventModal({
  initial,
  days,
  onSave,
  onClose,
  onDelete,
  saving,
  error,
  shiftTypes,
}: {
  initial: Omit<ScheduleEvent, 'id' | 'sort_order'>
  days: ScheduleDay[]
  onSave: (form: Omit<ScheduleEvent, 'id' | 'sort_order'>) => void
  onClose: () => void
  // Edit mode only — deleting an event that doesn't exist yet is meaningless.
  onDelete?: () => void
  shiftTypes: ShiftTypeOption[]
  saving: boolean
  error: string | null
}) {
  const [form, setForm] = useState(initial)
  const set = (k: keyof typeof form, v: unknown) => setForm((p) => ({ ...p, [k]: v }))

  // The weekday derives from the picked date — no separate Day dropdown to get
  // out of sync (picking the wrong Wednesday used to be an easy mistake).
  const derivedDay = weekdayFromISO(form.event_date)

  // Recurring day chips: NULL means every day (all chips lit); toggling off a
  // day materialises the subset. Re-selecting everything folds back to NULL so
  // "every day" keeps auto-covering days if the event range later grows.
  const toggleRecurrenceDay = (iso: string) => {
    const all = days.map(d => d.iso)
    const current = form.recurrence_days ?? all
    const next = current.includes(iso) ? current.filter(x => x !== iso) : [...current, iso].sort()
    set('recurrence_days', all.every(a => next.includes(a)) ? null : next)
  }

  // Non-recurring events need a real date so the schedule can place them.
  // Every event needs a start time (no free-text times); shifts also need an
  // end so their hours can be counted. Recurring subsets need ≥ 1 day.
  const canSave = !!form.title
    && (form.is_recurring || !!form.event_date)
    && !!form.start_time
    && (form.participation_type !== 'shift' || !!form.end_time)
    && (!form.is_recurring || form.recurrence_days == null || form.recurrence_days.length > 0)
  const missing = !form.title ? 'a title'
    : (!form.is_recurring && !form.event_date) ? 'a date'
    : !form.start_time ? 'a start time'
    : (form.participation_type === 'shift' && !form.end_time) ? 'an end time (shift hours need it)'
    : (form.is_recurring && form.recurrence_days != null && form.recurrence_days.length === 0) ? 'at least one repeat day'
    : null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(95vw, 580px)', maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--ink)', border: '1px solid rgb(var(--gold-rgb) / 0.25)',
        borderRadius: '1rem', padding: '1.5rem', zIndex: 50,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--gold)', margin: 0 }}>
            {initial.title ? 'Edit event' : 'New event'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: '1.4rem', cursor: 'pointer', opacity: 0.7 }}>×</button>
        </div>

        <Field label="Title">
          <input style={inputStyle} value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>

        {/* Date first — the weekday derives from it, shown as instant feedback. */}
        {!form.is_recurring && (
          <Field label="Date">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <input
                style={{ ...inputStyle, width: '180px' }}
                type="date"
                value={form.event_date ?? ''}
                onChange={e => set('event_date', e.target.value || null)}
              />
              <span style={{ fontSize: '0.85rem', color: derivedDay ? 'var(--gold)' : 'rgb(var(--cream-rgb) / 0.35)', letterSpacing: '0.04em', fontStyle: derivedDay ? 'normal' : 'italic' }}>
                {derivedDay ?? 'pick a date'}
              </span>
            </div>
          </Field>
        )}

        {/* Every event carries structured times — the display string derives
            from them on save. End is optional except for shifts (hours math). */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0 1rem', alignItems: 'end' }}>
          <Field label="Start">
            <TimeField value={form.start_time} onChange={v => set('start_time', v)} />
          </Field>
          <Field label={form.participation_type === 'shift' ? 'End' : 'End (optional)'}>
            <TimeField value={form.end_time} onChange={v => set('end_time', v)} durationFrom={form.start_time} />
          </Field>
          <div style={{ marginBottom: '1rem', paddingBottom: '0.6rem', fontSize: '0.82rem', color: 'var(--gold)', opacity: 0.75, whiteSpace: 'nowrap' }}>
            {shiftDurationHours(form.start_time, form.end_time) > 0 ? `${shiftDurationHours(form.start_time, form.end_time)}h` : '—'}
          </div>
        </div>

        {/* Late-night convention, said where it matters: the date stays the true
            morning date, but the event lists/renders as the previous night. */}
        {(parseHHMM(form.start_time) ?? LATE_NIGHT_BOUNDARY_MIN) < LATE_NIGHT_BOUNDARY_MIN && (
          <p style={{ fontSize: '0.75rem', color: 'var(--gold)', opacity: 0.7, lineHeight: 1.5, margin: '-0.4rem 0 1rem' }}>
            ✦ Before 6:00 AM counts as late night{form.is_recurring
              ? ' — each picked day means that night, running past midnight.'
              : form.event_date
                ? ` — this shows at the end of ${weekdayFromISO(addDays(form.event_date, -1)) ?? 'the previous day'} night; keep the date (${form.event_date}) as the morning it actually happens.`
                : ' — pick the date of the morning it actually happens; it will show at the end of the previous night.'}
          </p>
        )}

        {/* Recurring events pick their days here (no single date to pick above).
            All chips lit = every day, incl. days added to the range later. */}
        {form.is_recurring && (
          <Field label="Repeats on">
            {days.length === 0 ? (
              <p style={{ fontSize: '0.78rem', opacity: 0.45, lineHeight: 1.5, margin: 0 }}>
                Every day. Set the event dates in Configure → Event Dates to choose specific days.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {days.map(d => {
                    const selected = form.recurrence_days == null || form.recurrence_days.includes(d.iso)
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => toggleRecurrenceDay(d.iso)}
                        style={{
                          padding: '0.35rem 0.75rem', borderRadius: '9999px', cursor: 'pointer',
                          fontSize: '0.7rem', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                          border: `1px solid ${selected ? 'rgb(var(--gold-rgb) / 0.6)' : 'rgb(var(--gold-rgb) / 0.2)'}`,
                          background: selected ? 'rgb(var(--gold-rgb) / 0.12)' : 'transparent',
                          color: 'var(--gold)', opacity: selected ? 1 : 0.45,
                        }}
                      >
                        {d.short} {d.date}
                      </button>
                    )
                  })}
                </div>
                <p style={{ fontSize: '0.72rem', opacity: 0.4, lineHeight: 1.5, margin: '0.4rem 0 0' }}>
                  {form.recurrence_days == null
                    ? 'Every day — including any days later added to the event range.'
                    : `${form.recurrence_days.length} day${form.recurrence_days.length === 1 ? '' : 's'} selected.`}
                </p>
              </>
            )}
          </Field>
        )}

        {!form.is_recurring && (
          <Field label="Subtitle — shown in the At a Glance table">
            <textarea rows={2} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} value={form.subtitle ?? ''} onChange={(e) => set('subtitle', e.target.value)} placeholder="Short italic line under the event title in the schedule table" />
          </Field>
        )}

        <Field label={form.is_recurring ? 'Description' : 'Details — shown in the Event Details cards'}>
          <textarea rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} value={form.detail_desc ?? ''} onChange={(e) => set('detail_desc', e.target.value)} placeholder="Longer description" />
        </Field>

        <Field label="Icon">
          <AssetImagePicker
            value={isImageIcon(form.icon_type) ? form.icon_type : undefined}
            onChange={v => set('icon_type', v ?? 'star')}
            uploadUrl="/api/admin/schedule/icon"
            primaryCategory="icon"
            label="Event icon"
          />
        </Field>

        <Field label="Participation">
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={form.participation_type}
            onChange={e => set('participation_type', e.target.value)}
          >
            <option value="general">General — just happening, optional</option>
            <option value="shift">Shift — members sign up</option>
            <option value="mandatory">Mandatory — everyone attends</option>
          </select>
        </Field>

        {form.participation_type === 'shift' && (
          <>
            <Field label="Shift type">
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={form.shift_type_id ?? ''}
                onChange={e => set('shift_type_id', e.target.value || null)}
              >
                <option value="">Select…</option>
                {shiftTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <p style={{ fontSize: '0.72rem', opacity: 0.4, lineHeight: 1.5, margin: '0.35rem 0 0' }}>
                Kinds are defined in Configure → Shift Types. Requirements (who owes hours) live on groups/roles or attunement tasks.
              </p>
            </Field>
            <Field label="Lead role">
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={form.needs_lead}
                  onChange={e => set('needs_lead', e.target.checked)}
                  style={{ marginTop: '0.2rem', accentColor: 'var(--gold)', cursor: 'pointer' }}
                />
                <span style={{ opacity: 0.75, lineHeight: 1.5 }}>
                  This shift has a lead ✦ — members are offered &ldquo;I&rsquo;d like to be the shift lead&rdquo; when they sign up
                </span>
              </label>
            </Field>
            <Field label="Capacity per slot (optional — blank = unlimited)">
              <input
                style={{ ...inputStyle, width: '120px' }}
                type="number"
                min={1}
                placeholder="e.g. 20"
                value={form.capacity ?? ''}
                onChange={e => set('capacity', e.target.value === '' ? null : parseInt(e.target.value) || null)}
              />
            </Field>
          </>
        )}

        {form.participation_type === 'mandatory' && (
          <div style={{ marginBottom: '1rem' }}>
            <Toggle checked={form.requires_ack} onChange={(v) => set('requires_ack', v)} label="Requires acknowledgement (members tap “I'll be there”)" />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.5rem', marginBottom: '1.25rem' }}>
          <Toggle checked={form.visible} onChange={(v) => set('visible', v)} label="Visible" />
          <Toggle checked={form.highlight} onChange={(v) => set('highlight', v)} label="Highlight day" />
          <Toggle checked={form.is_recurring} onChange={(v) => set('is_recurring', v)} label="Recurring" />
          {/* Off = not on the schedule page / home teaser, but members can
              still sign up or acknowledge it (unlike Visible, which hides it
              from members everywhere). */}
          <Toggle checked={form.show_on_schedule} onChange={(v) => set('show_on_schedule', v)} label="Show on schedule page" />
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
          {/* Delete lives here too — from the week view the modal is the only
              way to reach an event, so it can't be list-row-only. */}
          {onDelete && (
            <button onClick={onDelete} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgba(255,100,100,0.25)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.82rem', opacity: 0.7, marginRight: 'auto' }}>
              Delete
            </button>
          )}
          {missing && (
            <span style={{ fontSize: '0.72rem', color: 'var(--gold)', opacity: 0.55, fontStyle: 'italic', marginRight: onDelete ? undefined : 'auto' }}>
              Needs {missing}
            </span>
          )}
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'transparent', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.82rem', opacity: 0.7 }}>
            Cancel
          </button>
          <button onClick={() => onSave(form)} disabled={saving || !canSave} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.45)', background: 'transparent', color: 'var(--lemon)', cursor: 'pointer', fontSize: '0.82rem', letterSpacing: '0.05em', opacity: (saving || !canSave) ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save event'}
          </button>
        </div>
      </div>
    </>
  )
}

const PARTICIPATION_BADGE: Record<string, string> = { general: '#8fb0d0', shift: 'var(--purple)', mandatory: 'var(--gold)' }

// Drag-reorder only exists where order is real: recurring events render in
// sort_order on the member schedule. Dated events order by date + time, so
// their rows aren't draggable.
type DragHandlers = {
  isDragOver: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
}

function EventRow({
  event,
  shiftTypeName,
  showDay,
  subLabel,
  drag,
  roster,
  onEdit,
  onDelete,
  onToggleVisible,
}: {
  event: ScheduleEvent
  shiftTypeName?: string
  showDay?: boolean
  subLabel?: string
  drag?: DragHandlers
  roster?: React.ReactNode
  onEdit: () => void
  onDelete: () => void
  onToggleVisible: () => void
}) {
  return (
    <div
      draggable={!!drag}
      onDragStart={drag?.onDragStart}
      onDragOver={drag?.onDragOver}
      onDrop={drag?.onDrop}
      onDragEnd={drag?.onDragEnd}
      style={{
        padding: '0.6rem 1rem', borderRadius: '0.65rem',
        border: drag?.isDragOver
          ? '1px solid rgb(var(--gold-rgb) / 0.5)'
          : '1px solid rgb(var(--gold-rgb) / 0.12)',
        background: drag?.isDragOver
          ? 'rgb(var(--gold-rgb) / 0.07)'
          : event.visible ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.005)',
        opacity: event.visible ? 1 : 0.5,
        cursor: drag ? 'grab' : 'default',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
    {/* flexWrap: on phone widths the badge/action cluster drops to its own
        right-aligned line instead of shoving Edit/✕ past the viewport edge */}
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
      {/* Drag handle (recurring only) */}
      {drag && (
        <div style={{ color: 'var(--gold)', opacity: 0.25, flexShrink: 0, fontSize: '1rem', lineHeight: 1, userSelect: 'none' }}>
          ⠿
        </div>
      )}

      {/* Time column — aligned down the day, so the eye reads a timetable */}
      <div style={{ width: '6.2rem', flexShrink: 0, fontSize: '0.72rem', lineHeight: 1.4, color: 'var(--gold)', opacity: event.time ? 0.75 : 0.3 }}>
        {event.time || '—'}
      </div>

      {/* Icon */}
      <div style={{ color: 'var(--gold)', opacity: 0.45, flexShrink: 0 }}>
        <EventIcon type={event.icon_type} size={18} />
      </div>

      {/* Title (+ weekday name for undated legacy rows) — the 10rem basis is
          what triggers the wrap before the title column gets crushed */}
      <div style={{ flex: '1 1 10rem', minWidth: 0 }}>
        <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--cream)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.title}
          {event.highlight && <span style={{ color: 'var(--gold)', opacity: 0.7, marginLeft: '0.4rem' }}>✦</span>}
        </p>
        {(subLabel ?? (showDay && event.day ? event.day : null)) && (
          <p style={{ fontSize: '0.68rem', color: 'var(--gold)', opacity: 0.5, margin: '0.1rem 0 0', letterSpacing: '0.06em' }}>{subLabel ?? event.day}</p>
        )}
      </div>

      {/* Participation badge — shift shows its shift-type name */}
      {event.participation_type !== 'general' && (
        <span style={{ fontSize: '0.6rem', color: PARTICIPATION_BADGE[event.participation_type] ?? 'var(--gold)', opacity: 0.9, border: `1px solid ${(PARTICIPATION_BADGE[event.participation_type] ?? 'var(--gold)')}55`, borderRadius: '9999px', padding: '0.1rem 0.5rem', flexShrink: 0, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
          {event.participation_type === 'shift' ? (shiftTypeName ?? 'Shift') : 'Mandatory'}
        </span>
      )}
      {!event.show_on_schedule && (
        <span
          title="Not shown on the schedule page or home teaser (members can still sign up / acknowledge)"
          style={{ fontSize: '0.6rem', color: 'var(--gold)', opacity: 0.55, border: '1px dashed rgb(var(--gold-rgb) / 0.35)', borderRadius: '9999px', padding: '0.1rem 0.5rem', flexShrink: 0, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}
        >
          off schedule
        </span>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, marginLeft: 'auto' }}>
        <button
          onClick={onToggleVisible}
          title={event.visible ? 'Visible to members — click to hide' : 'Hidden from members — click to show'}
          aria-label={event.visible ? 'Visible to members — click to hide' : 'Hidden from members — click to show'}
          style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.4rem', color: 'var(--gold)', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.6 }}
        >
          {event.visible ? '●' : '○'}
        </button>
        <button onClick={onEdit} style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.4rem', color: 'var(--gold)', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.6 }}>
          Edit
        </button>
        <button onClick={onDelete} style={{ background: 'none', border: '1px solid rgba(255,100,100,0.2)', borderRadius: '0.4rem', color: 'var(--danger)', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.5 }}>
          ✕
        </button>
      </div>
    </div>
    {roster}
    </div>
  )
}

// Compact roster under a shift row: count vs capacity, then one chip per holder
// (✦ = lead). Chips toggle lead/member with the same set_shift_role PATCH the
// member page uses — so the digest's "full but no lead" flag is fixable right
// here. Legacy-only holds can't carry a role, so their chip is inert. A
// recurring shift breaks out one line per night (each is a regular shift).
function ShiftRosterLine({ event, entries, label, busyKey, onToggleLead }: {
  event: ScheduleEvent
  entries: RosterEntry[]
  label: string | null
  busyKey: string | null
  onToggleLead: (entry: RosterEntry) => void
}) {
  const n = entries.length
  const hasLead = entries.some(e => e.role === 'lead')
  const full = event.capacity != null && n >= event.capacity
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
      {label && (
        <span style={{ fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--purple)', opacity: 0.7, whiteSpace: 'nowrap', minWidth: '3.4rem' }}>
          {label}
        </span>
      )}
      <span style={{ fontSize: '0.68rem', color: full ? 'var(--gold)' : 'var(--cream)', opacity: full ? 0.85 : 0.4, whiteSpace: 'nowrap' }}>
        {n}{event.capacity != null ? ` / ${event.capacity}` : ''} signed up
      </span>
      {event.needs_lead && n > 0 && !hasLead && (
        <span style={{ fontSize: '0.62rem', color: 'var(--gold)', border: '1px solid rgb(var(--gold-rgb) / 0.4)', borderRadius: '9999px', padding: '0.08rem 0.5rem', whiteSpace: 'nowrap' }}>
          ✦ no lead yet
        </span>
      )}
      {entries.map(e => {
        const busy = busyKey === `${event.id}|${e.clerk_user_id}|${e.occurrence_date ?? ''}`
        const lead = e.role === 'lead'
        return (
          <span key={`${e.clerk_user_id}|${e.occurrence_date ?? ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
            <button
              onClick={() => onToggleLead(e)}
              disabled={busy}
              title={lead ? 'Demote to member' : 'Make shift lead ✦'}
              style={{
                background: 'none', borderRadius: '9999px', padding: '0.12rem 0.55rem',
                fontSize: '0.68rem', whiteSpace: 'nowrap',
                border: `1px solid ${lead ? 'rgb(var(--gold-rgb) / 0.45)' : 'rgba(255,255,255,0.12)'}`,
                color: lead ? 'var(--gold)' : 'var(--cream)',
                cursor: 'pointer',
                opacity: busy ? 0.35 : lead ? 0.95 : 0.65,
              }}
            >
              {lead && <span style={{ marginRight: '0.3rem' }}>✦</span>}
              {e.name}
            </button>
            {e.application_id && (
              <a
                href={`/admin/${e.application_id}`}
                title={`View ${e.name}'s application`}
                style={{ fontSize: '0.6rem', color: 'var(--gold)', opacity: 0.4, textDecoration: 'none' }}
              >
                ↗
              </a>
            )}
          </span>
        )
      })}
    </div>
  )
}

function ShiftRoster({ event, entries, busyKey, error, onToggleLead }: {
  event: ScheduleEvent
  entries: RosterEntry[]
  busyKey: string | null
  error: string | null
  onToggleLead: (entry: RosterEntry) => void
}) {
  // Non-recurring: one line (occurrence null). Recurring: one line per night
  // that has holders, labelled by date, ordered chronologically.
  const nights = event.is_recurring
    ? Array.from(new Set(entries.map(e => e.occurrence_date ?? ''))).sort()
    : ['']
  return (
    <div style={{ marginTop: '0.5rem', paddingLeft: '6.95rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {nights.map(night => {
        const lineEntries = entries.filter(e => (e.occurrence_date ?? '') === night)
        if (event.is_recurring && lineEntries.length === 0) return null
        const label = event.is_recurring && night ? fmtNight(night) : null
        return (
          <ShiftRosterLine
            key={night || 'single'}
            event={event}
            entries={lineEntries}
            label={label}
            busyKey={busyKey}
            onToggleLead={onToggleLead}
          />
        )
      })}
      {error && <span style={{ fontSize: '0.68rem', color: 'var(--danger)' }}>{error}</span>}
    </div>
  )
}

// Section header shared by the day groups: label · count · hairline · add.
function GroupHeader({ label, sub, count, onAdd, addLabel, color = 'var(--gold)' }: {
  label: string
  sub?: string
  count?: number
  onAdd?: () => void
  addLabel?: string
  color?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.6rem' }}>
      <span style={{ fontSize: '0.72rem', letterSpacing: '0.15em', textTransform: 'uppercase', color, opacity: 0.75, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {sub && <span style={{ fontSize: '0.68rem', color: 'var(--cream)', opacity: 0.35, whiteSpace: 'nowrap' }}>{sub}</span>}
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: '0.68rem', color: 'var(--cream)', opacity: 0.3 }}>{count}</span>
      )}
      <span style={{ flex: 1, height: '1px', alignSelf: 'center', background: `linear-gradient(90deg, ${color}26, transparent)` }} />
      {onAdd && (
        <button
          onClick={onAdd}
          style={{ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: '0.72rem', letterSpacing: '0.06em', opacity: 0.55, padding: 0, whiteSpace: 'nowrap' }}
        >
          {addLabel ?? '+ Add'}
        </button>
      )}
    </div>
  )
}

export function ScheduleManager({ rangeStart, rangeEnd, initialEvents, initialShiftTypes, initialRosters, children }: {
  rangeStart?: string
  rangeEnd?: string
  // Server-rendered pages pass these (docs/architecture.md → Auth → "Server-
  // rendered section data") so the manager paints populated; the mount fetches
  // below run only when a prop is absent — except shift types, which always
  // refresh (they're authored on another tab, so the prop can be stale).
  // The API routes stay the refresh path.
  initialEvents?: ScheduleEvent[]
  initialShiftTypes?: ShiftTypeOption[]
  initialRosters?: Record<string, RosterEntry[]>
  children?: React.ReactNode
}) {
  const [events, setEvents] = useState<ScheduleEvent[]>(initialEvents ?? [])
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeOption[]>(initialShiftTypes ?? [])
  const [rosters, setRosters] = useState<Record<string, RosterEntry[]>>(initialRosters ?? {})
  const [rosterBusy, setRosterBusy] = useState<string | null>(null)
  const [rosterError, setRosterError] = useState<{ eventId: string; message: string } | null>(null)
  const [loading, setLoading] = useState(initialEvents === undefined)
  const [loadError, setLoadError] = useState(false)
  const [modal, setModal] = useState<{ mode: 'add'; recurring: boolean; date?: string; time?: string } | { mode: 'edit'; event: ScheduleEvent } | null>(null)
  const [view, setView] = useState<'list' | 'week'>('list')

  // The toggle remembers itself across visits (it kept resetting to List).
  // Read after mount — the server render can't see localStorage.
  useEffect(() => {
    if (localStorage.getItem('admin-schedule-view') === 'week') setView('week')
  }, [])
  const switchView = (v: 'list' | 'week') => {
    setView(v)
    try { localStorage.setItem('admin-schedule-view', v) } catch {}
  }
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  // Row-action failures (delete / visibility toggle) outside the modal — the
  // modal shows modalError, the week grid shows moveError.
  const [actionError, setActionError] = useState<string | null>(null)
  const draggedId = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const { confirm, confirmDialog } = useConfirm()
  const { choose, choiceDialog } = useChoice()

  // A recurring event's concrete nights, in occurrence terms (NOT `days`, which
  // unions stray dated-event dates into the range — a signup can only exist on
  // a true occurrence, and materialising recurrence_days from anything wider
  // would silently ADD nights). Empty = every-day with no configured range.
  const nightsOf = (ev: ScheduleEvent): string[] =>
    ev.recurrence_days ?? eventRangeDays(rangeStart, rangeEnd)
  const signupsOn = (ev: ScheduleEvent, night: string) =>
    (rosters[ev.id] ?? []).filter(e => e.occurrence_date === night).length
  const signupSub = (n: number) => n === 0 ? 'no signups' : `${n} signup${n === 1 ? '' : 's'}`

  const load = async () => {
    setLoadError(false)
    try {
      const res = await fetch('/api/admin/schedule')
      if (!res.ok) throw new Error()
      const json = await res.json()
      // API order = sort_order, which recurring rows rely on; day groups re-sort by time.
      setEvents(json.events)
    } catch {
      setLoadError(true)
    }
    setLoading(false)
  }

  useEffect(() => { if (initialEvents === undefined) load() }, [])

  // Shift types are authored on a different tab (Configure), so the
  // server-rendered list can be stale — Next's router cache prefetches this
  // page before the type is added. Always refetch: on mount (silent refresh
  // behind the server-rendered first paint) and again whenever the add/edit
  // modal opens, so the dropdown is fresh at the moment it's used. A failed
  // refresh keeps whatever list we already have.
  const refreshShiftTypes = () => {
    fetch('/api/admin/shift-types')
      .then(r => r.json())
      .then(d => setShiftTypes((d.shiftTypes ?? []).map((t: ShiftTypeOption) => ({ id: t.id, name: t.name }))))
      .catch(() => {})
  }
  useEffect(() => { refreshShiftTypes() }, [])
  useEffect(() => { if (modal) refreshShiftTypes() }, [modal !== null])

  // Rosters also refresh after a save that trimmed a recurring event's nights —
  // the PATCH deletes those nights' signups server-side, so the local copy is
  // stale the moment the save lands.
  const refreshRosters = () => {
    fetch('/api/admin/schedule/rosters')
      .then(r => r.json())
      .then(d => setRosters(d.rosters ?? {}))
      .catch(() => {})
  }
  useEffect(() => { if (initialRosters === undefined) refreshRosters() }, [])

  const dated = events.filter((e) => !e.is_recurring && e.event_date)
  const undated = [...events.filter((e) => !e.is_recurring && !e.event_date)].sort(
    (a, b) => ((DAY_ORDER[a.day] ?? 99) - (DAY_ORDER[b.day] ?? 99)) || (parseStartMinutes(a.time) - parseStartMinutes(b.time))
  )
  const recurring = events.filter((e) => e.is_recurring)

  // Same day model as the member calendar: configured range ∪ every DISPLAY
  // date (a late-night event groups under the previous night, so its true
  // morning date must not spawn a day section of its own).
  const days = buildScheduleDays(dated.map(displayIsoOf), rangeStart, rangeEnd)
  const eventsOn = (iso: string) => sortByTime(dated.filter((e) => displayIsoOf(e) === iso))

  const jumpTo = (key: string) => {
    sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Field edits that make sense per-night (everything except the recurrence
  // shape itself) — compared to decide whether to offer "just one night".
  const SPLIT_FIELD_KEYS: (keyof Omit<ScheduleEvent, 'id' | 'sort_order'>)[] =
    ['title', 'subtitle', 'detail_desc', 'icon_type', 'visible', 'highlight', 'capacity', 'participation_type', 'shift_type_id', 'requires_ack', 'start_time', 'end_time', 'needs_lead', 'show_on_schedule']
  const sameDays = (a: string[] | null, b: string[] | null) =>
    a == null || b == null ? a == b : JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

  const handleSave = async (form: Omit<ScheduleEvent, 'id' | 'sort_order'>) => {
    // Editing a recurring event asks "all nights, or just one?" (calendar-style
    // occurrence exception). "Just Jul 24" carves the night out into its own
    // one-off event with the changes applied — its signups move with it, the
    // series loses the night (split_night in the PATCH). Only offered when
    // series fields changed and the day chips weren't touched: chip changes
    // are inherently series-level and take the trim path below instead.
    if (modal?.mode === 'edit' && form.is_recurring && modal.event.is_recurring
      && sameDays(form.recurrence_days, modal.event.recurrence_days)
      && SPLIT_FIELD_KEYS.some(k => (form[k] ?? null) !== (modal.event[k] ?? null))) {
      const nights = nightsOf(modal.event)
      if (nights.length > 1) {
        const picked = await choose({
          eyebrow: 'Recurring event',
          title: 'Save these changes for…',
          body: 'All nights, or just one? A single night becomes its own event with these changes — its signups stay with it.',
          choices: [
            { value: '__all__', label: 'All nights' },
            ...nights.map(night => ({ value: night, label: `Just ${fmtNight(night)}`, sub: signupSub(signupsOn(modal.event, night)) })),
          ],
        })
        if (picked == null) return
        if (picked !== '__all__') {
          setSaving(true)
          setModalError(null)
          const time = formatShiftRange(form.start_time, form.end_time) || form.time
          const { is_recurring: _ir, recurrence_days: _rd, event_date: _ed, ...splitFields } = form
          try {
            const res = await fetch(`/api/admin/schedule/${modal.event.id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ split_night: picked, ...splitFields, time }),
            })
            if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
            await load()
            refreshRosters()
            setModal(null)
          } catch (e: unknown) {
            setModalError(e instanceof Error ? e.message : 'Something went wrong')
          } finally {
            setSaving(false)
          }
          return
        }
      }
    }
    // Unchecking a repeat-day chip removes that night — and the PATCH below
    // deletes that night's signups server-side (they're occurrence_date-keyed;
    // nothing else cleans them up). Never silently: count what the roster
    // holds on the dropped nights and get an informed confirm first.
    if (modal?.mode === 'edit' && form.is_recurring && form.recurrence_days != null) {
      const keep = new Set(form.recurrence_days)
      const gone = (rosters[modal.event.id] ?? []).filter(e => e.occurrence_date && !keep.has(e.occurrence_date))
      if (gone.length > 0) {
        const nights = Array.from(new Set(gone.map(e => e.occurrence_date as string))).sort()
        const s = gone.length === 1 ? '' : 's'
        const ok = await confirm({
          eyebrow: 'Signups will be deleted',
          title: nights.length === 1
            ? `Remove the ${fmtNight(nights[0])} night?`
            : `Remove ${nights.length} nights?`,
          body: `${gone.length} signup${s} on ${nights.map(fmtNight).join(' · ')} will be permanently deleted when you save — those members lose their spot${s} and are not notified. Signups on the remaining nights are kept.`,
          confirmLabel: `Remove and delete ${gone.length} signup${s}`,
          danger: true,
        })
        if (!ok) return
      }
    }
    setSaving(true)
    setModalError(null)
    // The display `time` derives from structured start/end for every event —
    // the modal requires a start, so the fallback to the old text only guards
    // against an empty result ever wiping a legacy display line.
    const time = formatShiftRange(form.start_time, form.end_time) || form.time
    const normalised = { ...form, time }
    try {
      let res: Response
      if (modal?.mode === 'edit') {
        res = await fetch(`/api/admin/schedule/${modal.event.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(normalised),
        })
      } else {
        res = await fetch('/api/admin/schedule', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(normalised),
        })
      }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      await load()
      refreshRosters()
      setModal(null)
    } catch (e: unknown) {
      setModalError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  // Deleting one night of a recurring event = trimming it from recurrence_days;
  // the PATCH deletes that night's signups server-side. Informed confirm first.
  const removeNight = async (ev: ScheduleEvent, night: string): Promise<boolean> => {
    // Count what the PATCH will actually delete — every signup outside the
    // kept set, not just the target night. A signup can sit outside today's
    // nights (the range was narrowed after it was taken); the server-side
    // cleanup takes those too, so the confirm must own up to them.
    const keep = new Set(nightsOf(ev).filter(d => d !== night))
    const gone = (rosters[ev.id] ?? []).filter(e => e.occurrence_date && !keep.has(e.occurrence_date))
    const goneNights = Array.from(new Set(gone.map(e => e.occurrence_date as string))).sort()
    const n = gone.length
    const s = n === 1 ? '' : 's'
    const ok = await confirm(n === 0
      ? {
          title: `Remove the ${fmtNight(night)} night of “${ev.title}”?`,
          body: 'No one is signed up for it. The other nights are untouched.',
          confirmLabel: 'Remove night',
          danger: true,
        }
      : {
          eyebrow: 'Signups will be deleted',
          title: `Remove the ${fmtNight(night)} night of “${ev.title}”?`,
          body: goneNights.length === 1 && goneNights[0] === night
            ? `Its ${n} signup${s} will be permanently deleted — those members lose their spot${s} and are not notified. The other nights keep theirs.`
            : `${n} signup${s} on ${goneNights.map(fmtNight).join(' · ')} will be permanently deleted — saving also clears signups that no longer fall on one of the event's nights. Those members lose their spot${s} and are not notified. The remaining nights keep theirs.`,
          confirmLabel: `Remove night + delete ${n} signup${s}`,
          danger: true,
        })
    if (!ok) return false
    setActionError(null)
    const res = await fetch(`/api/admin/schedule/${ev.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recurrence_days: nightsOf(ev).filter(d => d !== night) }),
    }).catch(() => null)
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {}
      const msg = data.error ?? 'Something went wrong — the night was not removed.'
      if (modal) setModalError(msg)
      else setActionError(msg)
      return false
    }
    await load()
    refreshRosters()
    return true
  }

  // Returns whether the event was actually deleted, so the edit modal knows
  // whether to close (a cancelled confirm keeps it open).
  const handleDelete = async (id: string): Promise<boolean> => {
    const ev = events.find(e => e.id === id)
    // A recurring event with several nights asks WHICH first — the 2026-07-16
    // incident was a whole-series delete standing in for "remove Friday only".
    // (Single-night series and every-day series with no configured range have
    // no meaningful "just one" and go straight to the whole-event confirm.)
    if (ev?.is_recurring) {
      const nights = nightsOf(ev)
      if (nights.length > 1) {
        const picked = await choose({
          eyebrow: 'Recurring event',
          title: `Delete from “${ev.title}”…`,
          body: 'One night, or the whole event?',
          choices: [
            ...nights.map(night => ({ value: night, label: `Just ${fmtNight(night)}`, sub: signupSub(signupsOn(ev, night)) })),
            { value: '__all__', label: 'The whole event — every night', sub: signupSub((rosters[id] ?? []).length), danger: true },
          ],
        })
        if (picked == null) return false
        if (picked !== '__all__') return removeNight(ev, picked)
      }
    }
    // member_shift_signups cascades on event delete — deleting a shift event
    // destroys every night's signups with it. The confirm must say how much is
    // at stake (2026-07-16 incident: a whole recurring shift deleted to remove
    // one night, all signups gone without warning).
    const held = rosters[id] ?? []
    const n = held.length
    const nightCount = new Set(held.filter(e => e.occurrence_date).map(e => e.occurrence_date)).size
    const s = n === 1 ? '' : 's'
    const ok = await confirm(n === 0
      ? {
          title: `Delete ${ev ? `“${ev.title}”` : 'this event'}?`,
          confirmLabel: 'Delete event',
          danger: true,
        }
      : {
          eyebrow: 'Signups will be destroyed',
          title: `Delete ${ev ? `“${ev.title}”` : 'this event'} and its ${n} signup${s}?`,
          body: `This permanently deletes the event AND all ${n} signup${s}${nightCount > 1 ? ` across ${nightCount} nights` : ''} — those members lose their spot${s} and are not notified. ${ev?.is_recurring ? 'To drop a single night instead, keep the event and uncheck that day in Edit → Repeats on.' : 'There is no undo.'}`,
          confirmLabel: `Delete event + ${n} signup${s}`,
          danger: true,
        })
    if (!ok) return false
    setActionError(null)
    const res = await fetch(`/api/admin/schedule/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {}
      const msg = data.error ?? 'Something went wrong — the event was not deleted.'
      // Deleting from the edit modal keeps it open, so the error belongs there.
      if (modal) setModalError(msg)
      else setActionError(msg)
      return false
    }
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setRosters((prev) => { const { [id]: _gone, ...rest } = prev; return rest })
    return true
  }

  // Drop from the week grid: same-shape PATCH as the modal (structured times +
  // derived display string; the server re-derives `day` from event_date).
  // Optimistic — the block stays where it landed, and snaps back on failure.
  const handleMove = async (id: string, dateIso: string, start: string, end: string | null) => {
    const ev = events.find(e => e.id === id)
    if (!ev) return
    const prev = events
    const time = formatShiftRange(start, end) || ev.time
    setMoveError(null)
    setEvents(p => p.map(e => e.id === id
      ? { ...e, event_date: dateIso, day: weekdayFromISO(dateIso) ?? e.day, start_time: start, end_time: end, time }
      : e))
    try {
      const res = await fetch(`/api/admin/schedule/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_date: dateIso, start_time: start, end_time: end, time }),
      })
      if (!res.ok) { const d = await res.json().catch(() => null); throw new Error(d?.error) }
    } catch (e: unknown) {
      setEvents(prev)
      setMoveError(e instanceof Error && e.message ? e.message : 'Something went wrong — the event snapped back')
    }
  }

  const handleToggleVisible = async (event: ScheduleEvent) => {
    setActionError(null)
    const res = await fetch(`/api/admin/schedule/${event.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: !event.visible }),
    }).catch(() => null)
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {}
      setActionError(data.error ?? 'Something went wrong — visibility was not changed.')
      return
    }
    setEvents((prev) => prev.map((e) => e.id === event.id ? { ...e, visible: !e.visible } : e))
  }

  // Reorder within the recurring group (the only group where sort_order shows).
  const handleDropRecurring = async (targetId: string) => {
    const fromId = draggedId.current
    if (!fromId || fromId === targetId) return
    setDragOverId(null)
    draggedId.current = null

    const fromIdx = recurring.findIndex((e) => e.id === fromId)
    const toIdx = recurring.findIndex((e) => e.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return

    const reordered = [...recurring]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setEvents((prev) => [...prev.filter((e) => !e.is_recurring), ...reordered])

    await Promise.all(
      reordered.map((e, i) =>
        fetch(`/api/admin/schedule/${e.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: i + 1 }),
        })
      )
    )
  }

  const dragHandlersFor = (ev: ScheduleEvent): DragHandlers => ({
    isDragOver: dragOverId === ev.id,
    onDragStart: () => { draggedId.current = ev.id },
    onDragOver: (e) => { e.preventDefault(); setDragOverId(ev.id) },
    onDrop: () => handleDropRecurring(ev.id),
    onDragEnd: () => { draggedId.current = null; setDragOverId(null) },
  })

  const openAdd = (date?: string, time?: string) => { setModal({ mode: 'add', recurring: false, date, time }); setModalError(null) }
  // Legacy rows (pre-054, or unparseable by the backfill) may have only the
  // free-text `time` — prefill Start/End from it so editing doesn't demand
  // retyping a time the row already knows.
  const openEdit = (ev: ScheduleEvent) => {
    const legacy = ev.start_time ? { start: ev.start_time, end: ev.end_time } : (() => {
      const r = rangeTo24h(ev.time)
      return { start: r.start, end: ev.end_time ?? r.end }
    })()
    setModal({ mode: 'edit', event: { ...ev, start_time: legacy.start, end_time: legacy.end } })
    setModalError(null)
  }

  // Promote/demote a lead right on the roster — same endpoint as the member
  // page's "Make lead" (PATCH /api/admin/signups/[userId], set_shift_role).
  const handleToggleLead = async (eventId: string, entry: RosterEntry) => {
    setRosterBusy(`${eventId}|${entry.clerk_user_id}|${entry.occurrence_date ?? ''}`)
    setRosterError(null)
    const role = entry.role === 'lead' ? 'member' : 'lead'
    try {
      const res = await fetch(`/api/admin/signups/${entry.clerk_user_id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        // occurrence_date scopes the lead to the specific night held.
        body: JSON.stringify({ set_shift_role: { schedule_event_id: eventId, role, occurrence_date: entry.occurrence_date } }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setRosters(prev => ({
        ...prev,
        [eventId]: (prev[eventId] ?? []).map(e =>
          e.clerk_user_id === entry.clerk_user_id && e.occurrence_date === entry.occurrence_date ? { ...e, role } : e),
      }))
    } catch (e: unknown) {
      setRosterError({ eventId, message: e instanceof Error ? e.message : 'Something went wrong' })
    } finally {
      setRosterBusy(null)
    }
  }

  // "Every day" or the picked dates ("Jul 22 · Jul 24") under a recurring row.
  const recurrenceLabel = (ev: ScheduleEvent) => ev.recurrence_days == null
    ? 'Every day'
    : [...ev.recurrence_days].sort().map(fmtNight).join(' · ') || 'No days selected'

  const rowProps = (ev: ScheduleEvent) => ({
    event: ev,
    shiftTypeName: shiftTypes.find((t) => t.id === ev.shift_type_id)?.name,
    roster: ev.participation_type === 'shift' ? (
      <ShiftRoster
        event={ev}
        entries={rosters[ev.id] ?? []}
        busyKey={rosterBusy}
        error={rosterError?.eventId === ev.id ? rosterError.message : null}
        onToggleLead={(entry) => handleToggleLead(ev.id, entry)}
      />
    ) : undefined,
    onEdit: () => openEdit(ev),
    onDelete: () => handleDelete(ev.id),
    onToggleVisible: () => handleToggleVisible(ev),
  })

  const chipStyle = (color = 'var(--gold)'): React.CSSProperties => ({
    flexShrink: 0, padding: '0.35rem 0.8rem', borderRadius: '9999px',
    border: `1px solid ${color}33`, background: 'transparent',
    color, cursor: 'pointer', fontSize: '0.7rem', letterSpacing: '0.08em',
    whiteSpace: 'nowrap', opacity: 0.75,
  })

  if (loading || loadError) return (
    <div>
      {children}
      {loading
        ? <p style={{ opacity: 0.4, fontStyle: 'italic', fontSize: '0.875rem', marginTop: '0.75rem' }}>Loading…</p>
        : <LoadError onRetry={() => { setLoading(true); load() }} />}
    </div>
  )

  return (
    <div>
      {/* One controls row opens the workspace: the shift-signup pill (rides
          in as children) on the left, view + add on the right. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>{children}</div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* List ⇄ Week: the list is the working roster; the week grid shows
              time as space (overlaps, gaps, lopsided days). */}
          <div style={{ display: 'flex', border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '9999px', overflow: 'hidden' }}>
            {(['list', 'week'] as const).map(v => (
              <button
                key={v}
                onClick={() => switchView(v)}
                style={{
                  padding: '0.45rem 0.9rem', border: 'none', cursor: 'pointer',
                  fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'capitalize',
                  background: view === v ? 'rgb(var(--gold-rgb) / 0.15)' : 'transparent',
                  color: 'var(--gold)', opacity: view === v ? 1 : 0.5,
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.25)', background: 'transparent', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: '0.06em', opacity: 0.75 }}
            onClick={() => openAdd()}
          >
            + Add event
          </button>
        </div>
      </div>

      {actionError && (
        <p style={{ color: 'var(--danger)', fontSize: '0.78rem', margin: '0 0 0.85rem' }}>{actionError}</p>
      )}

      {/* Week view — day columns × hour axis; click empty slot to add there,
          drag a block to move it to a new time/day */}
      {view === 'week' && (
        <div style={{ marginBottom: '1.5rem' }}>
          {moveError && (
            <p style={{ color: 'var(--danger)', fontSize: '0.78rem', margin: '0 0 0.6rem' }}>{moveError}</p>
          )}
          <ScheduleWeekView
            events={events}
            days={days}
            shiftTypes={shiftTypes}
            rosters={rosters}
            onEdit={id => { const ev = events.find(e => e.id === id); if (ev) openEdit(ev) }}
            onAddAt={(iso, time) => openAdd(iso, time)}
            onMove={handleMove}
          />
        </div>
      )}

      {/* Day rail — one chip per day, click to jump */}
      {view === 'list' && (days.length > 1 || undated.length > 0 || recurring.length > 0) && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', paddingBottom: '0.4rem', marginBottom: '1.25rem' }}>
          {days.map((d) => {
            const n = eventsOn(d.iso).length
            return (
              <button key={d.iso} style={{ ...chipStyle(), opacity: n > 0 ? 0.85 : 0.4 }} onClick={() => jumpTo(d.iso)}>
                {d.short} {d.date}
              </button>
            )
          })}
          {undated.length > 0 && (
            <button style={chipStyle('var(--danger)')} onClick={() => jumpTo('undated')}>Undated</button>
          )}
          {recurring.length > 0 && (
            <button style={chipStyle('var(--purple)')} onClick={() => jumpTo('recurring')}>Recurring</button>
          )}
        </div>
      )}

      {/* Day sections */}
      {days.length === 0 && undated.length === 0 && (
        <p style={{ opacity: 0.35, fontStyle: 'italic', fontSize: '0.82rem' }}>
          No events yet. Set the event dates in Configure → Event Dates to lay out the days, or add a dated event.
        </p>
      )}
      {view === 'list' && days.map((d) => {
        const dayEvents = eventsOn(d.iso)
        return (
          <div key={d.iso} ref={(el) => { sectionRefs.current[d.iso] = el }} style={{ marginBottom: '1.5rem', scrollMarginTop: '5.5rem' }}>
            <GroupHeader
              label={`${d.label} · ${d.month} ${d.date}`}
              count={dayEvents.length}
              onAdd={() => openAdd(d.iso)}
            />
            {dayEvents.length === 0 ? (
              <p style={{ opacity: 0.25, fontStyle: 'italic', fontSize: '0.78rem', margin: '0 0 0 1rem' }}>Nothing scheduled.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {dayEvents.map((ev) => (
                  <EventRow
                    key={ev.id}
                    {...rowProps(ev)}
                    subLabel={isLateNight(ev) ? `late night · into ${weekdayFromISO(ev.event_date) ?? 'the next morning'}` : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Undated legacy rows — they need a real date to sit on the calendar */}
      {undated.length > 0 && (
        <div ref={(el) => { sectionRefs.current['undated'] = el }} style={{ marginBottom: '1.5rem', scrollMarginTop: '5.5rem' }}>
          <GroupHeader label="Undated" sub="edit each event to give it a date" count={undated.length} color="var(--danger)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {undated.map((ev) => <EventRow key={ev.id} {...rowProps(ev)} showDay />)}
          </div>
        </div>
      )}

      {/* Divider */}
      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.15), transparent)', margin: '0 0 1.5rem' }} />

      {/* Recurring events — order here is their display order, so drag persists */}
      <div ref={(el) => { sectionRefs.current['recurring'] = el }} style={{ scrollMarginTop: '5.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <p style={{ fontSize: '0.68rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--purple)', opacity: 0.55, margin: 0 }}>
            Recurring — {recurring.length}
          </p>
          <button
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '9999px', border: '1px solid rgb(var(--purple-rgb) / 0.25)', background: 'transparent', color: 'var(--purple)', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: '0.06em', opacity: 0.75 }}
            onClick={() => { setModal({ mode: 'add', recurring: true }); setModalError(null) }}
          >
            + Add recurring
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {recurring.length === 0 && <p style={{ opacity: 0.35, fontStyle: 'italic', fontSize: '0.82rem' }}>No recurring events yet.</p>}
          {recurring.map((ev) => <EventRow key={ev.id} {...rowProps(ev)} subLabel={recurrenceLabel(ev)} drag={dragHandlersFor(ev)} />)}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <EventModal
          initial={modal.mode === 'edit'
            ? modal.event
            : { ...blank(), is_recurring: modal.recurring, event_date: modal.date ?? null, start_time: modal.time ?? null }}
          days={days}
          onSave={handleSave}
          onClose={() => setModal(null)}
          onDelete={modal.mode === 'edit'
            ? async () => { if (await handleDelete(modal.event.id)) setModal(null) }
            : undefined}
          saving={saving}
          error={modalError}
          shiftTypes={shiftTypes}
        />
      )}

      {confirmDialog}
      {choiceDialog}
    </div>
  )
}

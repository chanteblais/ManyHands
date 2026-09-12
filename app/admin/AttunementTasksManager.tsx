'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ATTUNEMENT_REQUIREMENTS,
  ATTUNEMENT_NUDGE_OPTIONS,
  type AttunementRequirement,
  type AttunementTask,
} from '@/lib/site-config'
import { useConfirm } from '../components/ConfirmDialog'

const GOLD = '#C8A848'
const PURPLE = '#D239F8'
const CREAM = '#F3EDE6'

type CollectionOption = { id: string; name: string; groupCount: number }
type ShiftTypeOption = { id: string; name: string }

export function AttunementTasksManager({
  initialTasks,
  collections,
  totalGroupCount,
  shiftTypes,
  initialNudgeDays,
  sendHour,
  timezoneLabel,
}: {
  initialTasks: AttunementTask[]
  collections: CollectionOption[]
  totalGroupCount: number
  shiftTypes: ShiftTypeOption[]
  initialNudgeDays: number
  /** Community-local hour (0–23) the nudge cron sends at. */
  sendHour: number
  /** Short zone label for that hour, e.g. "PDT". */
  timezoneLabel: string
}) {
  // Max groups a 'collection' task may require = groups present in that collection
  // (or the total across all collections when no specific collection is chosen).
  const maxForTask = (task: AttunementTask): number =>
    task.collectionId
      ? (collections.find(c => c.id === task.collectionId)?.groupCount ?? 0)
      : totalGroupCount

  const reqHint = (task: AttunementTask): string => {
    if (task.requirement === 'collection') {
      const name = task.collectionId
        ? (collections.find(c => c.id === task.collectionId)?.name ?? 'a collection')
        : 'any collection'
      const n = task.requiredCount ?? 1
      const base = `Completes when the member belongs to ${n} group${n !== 1 ? 's' : ''} in ${name}.`
      return maxForTask(task) === 0 ? `${base} (No groups here yet — add some first.)` : base
    }
    if (task.requirement === 'shift') {
      const type = task.shiftTypeId
        ? (shiftTypes.find(s => s.id === task.shiftTypeId)?.name ?? 'a shift type')
        : 'any'
      const h = task.requiredHours ?? 1
      return `Completes when the member has signed up for ${h}h of ${type} shift${task.shiftTypeId ? 's' : ''}.`
    }
    return ATTUNEMENT_REQUIREMENTS.find(r => r.value === task.requirement)?.hint ?? ''
  }

  const [tasks, setTasks] = useState<AttunementTask[]>(initialTasks)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { confirm, confirmDialog } = useConfirm()

  const save = useCallback((next: AttunementTask[]) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/page-content', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config_attunement_tasks: JSON.stringify(next) }),
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
    }, 600)
  }, [])

  function update(next: AttunementTask[]) {
    setTasks(next)
    save(next)
  }

  // Reminder-email cadence (config_attunement_nudge_days; 0 = off) — saved
  // immediately, a select change is already a deliberate action.
  const [nudgeDays, setNudgeDays] = useState(initialNudgeDays)

  // Reminders go out once a day at the community's local send hour
  // (communities.timezone + settings.nudge_hour_local; the cron sweeps hourly).
  const sendTime = `${((sendHour + 11) % 12) + 1}:00 ${sendHour < 12 ? 'AM' : 'PM'} ${timezoneLabel}`
  async function changeNudgeDays(value: number) {
    setNudgeDays(value)
    try {
      const res = await fetch('/api/admin/page-content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_attunement_nudge_days: String(value) }),
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
  }

  // The requirement <select> encodes a collection choice as `col:<id>` (empty id
  // = any collection) and a shift choice as `shift:<id>` (empty id = any shift).
  // Static requirements keep their plain value.
  function changeRequirement(idx: number, value: string) {
    update(tasks.map((t, i) => {
      if (i !== idx) return t
      if (value.startsWith('col:')) {
        const id = value.slice(4) || undefined
        const max = id ? (collections.find(c => c.id === id)?.groupCount ?? 0) : totalGroupCount
        const requiredCount = Math.min(Math.max(t.requiredCount ?? 1, 1), Math.max(max, 1))
        return { id: t.id, label: t.label, enabled: t.enabled, requirement: 'collection' as const, collectionId: id, requiredCount }
      }
      if (value.startsWith('shift:')) {
        const id = value.slice(6) || undefined
        return { id: t.id, label: t.label, enabled: t.enabled, requirement: 'shift' as const, shiftTypeId: id, requiredHours: t.requiredHours ?? 1 }
      }
      // Other requirement: drop the collection/shift-only fields.
      return { id: t.id, label: t.label, enabled: t.enabled, requirement: value as AttunementRequirement }
    }))
  }

  function changeHours(idx: number, raw: string) {
    update(tasks.map((t, i) => {
      if (i !== idx) return t
      const requiredHours = Math.max(parseFloat(raw) || 0.5, 0.5)
      return { ...t, requiredHours }
    }))
  }

  // Clamp the required count to [1, groups present] so an admin can't require more
  // groups than the collection holds.
  function changeCount(idx: number, raw: string) {
    update(tasks.map((t, i) => {
      if (i !== idx) return t
      const max = Math.max(maxForTask(t), 1)
      const requiredCount = Math.min(Math.max(parseInt(raw, 10) || 1, 1), max)
      return { ...t, requiredCount }
    }))
  }

  return (
    <div>
      <p style={{ fontSize: '0.78rem', opacity: 0.5, lineHeight: 1.6, margin: '0 0 1.25rem' }}>
        These items make up the <strong style={{ opacity: 0.8 }}>Attunement Status</strong> checklist on each
        member&rsquo;s profile. Every item auto-completes when the member meets its requirement — pick the
        requirement from the dropdown. Disabled items are hidden from members.
      </p>

      {/* Reminder-email cadence */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
          border: '1px solid rgba(200,168,72,0.15)', borderRadius: '0.75rem',
          background: 'rgba(200,168,72,0.02)', padding: '0.75rem 1rem', marginBottom: '1.25rem',
        }}
      >
        <div style={{ flex: 1, minWidth: '220px' }}>
          <span style={{ display: 'block', fontSize: '0.85rem', color: CREAM }}>Reminder emails</span>
          <span style={{ display: 'block', fontSize: '0.72rem', opacity: 0.5, lineHeight: 1.5 }}>
            Members with outstanding tasks get an email at this cadence (mornings). Members can opt out;
            fully attuned members never get one.
          </span>
          {nudgeDays > 0 && (
            <span style={{ display: 'block', fontSize: '0.72rem', color: GOLD, opacity: 0.65, marginTop: '0.2rem' }}>
              Sent daily around {sendTime}
            </span>
          )}
        </div>
        <select
          value={nudgeDays}
          onChange={e => changeNudgeDays(parseInt(e.target.value, 10))}
          style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(200,168,72,0.2)',
            borderRadius: '0.3rem', color: CREAM, fontSize: '0.75rem',
            padding: '0.2rem 0.4rem', outline: 'none', fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          {ATTUNEMENT_NUDGE_OPTIONS.map(o => (
            <option key={o.value} value={o.value} style={{ background: '#1A0A24' }}>{o.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
        {tasks.length === 0 && (
          <p style={{ textAlign: 'center', opacity: 0.4, fontStyle: 'italic', fontSize: '0.82rem', padding: '1rem 0' }}>
            No attunement tasks. The checklist is hidden from members until you add one.
          </p>
        )}

        {tasks.map((task, idx) => (
          <div
            key={task.id}
            style={{
              border: '1px solid rgba(200,168,72,0.15)',
              borderRadius: '0.75rem',
              background: 'rgba(200,168,72,0.02)',
              padding: '0.85rem 1rem',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-start',
              opacity: task.enabled ? 1 : 0.55,
            }}
          >
            {/* Enable toggle */}
            <button
              onClick={() => update(tasks.map((t, i) => i === idx ? { ...t, enabled: !t.enabled } : t))}
              aria-pressed={task.enabled}
              title={task.enabled ? 'Shown to members' : 'Hidden from members'}
              style={{
                width: '40px', height: '22px', borderRadius: '9999px', flexShrink: 0, marginTop: '0.15rem',
                border: 'none', cursor: 'pointer',
                background: task.enabled ? GOLD : 'rgba(255,255,255,0.12)',
                transition: 'background 0.2s', position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute', top: '3px', left: task.enabled ? '21px' : '3px',
                width: '16px', height: '16px', borderRadius: '50%',
                background: task.enabled ? '#1A0A24' : 'rgba(255,255,255,0.5)',
                transition: 'left 0.2s',
              }} />
            </button>

            {/* Label + requirement */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 0 }}>
              <input
                value={task.label}
                onChange={e => update(tasks.map((t, i) => i === idx ? { ...t, label: e.target.value } : t))}
                placeholder="Label (e.g. Role Selected)"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'transparent', border: 'none',
                  borderBottom: '1px solid rgba(200,168,72,0.2)',
                  color: CREAM, fontSize: '0.85rem', outline: 'none',
                  padding: '0 0 0.15rem', fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.65rem', opacity: 0.4, letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                  Completes when
                </span>
                <select
                  value={
                    task.requirement === 'collection' ? `col:${task.collectionId ?? ''}`
                    : task.requirement === 'shift' ? `shift:${task.shiftTypeId ?? ''}`
                    : task.requirement
                  }
                  onChange={e => changeRequirement(idx, e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(200,168,72,0.2)',
                    borderRadius: '0.3rem', color: CREAM, fontSize: '0.75rem',
                    padding: '0.2rem 0.4rem', outline: 'none', fontFamily: 'inherit',
                  }}
                >
                  {ATTUNEMENT_REQUIREMENTS.map(r => (
                    <option key={r.value} value={r.value} style={{ background: '#1A0A24' }}>{r.label}</option>
                  ))}
                  <optgroup label="Shift hours" style={{ background: '#1A0A24' }}>
                    <option value="shift:" style={{ background: '#1A0A24' }}>Any shift</option>
                    {shiftTypes.map(s => (
                      <option key={s.id} value={`shift:${s.id}`} style={{ background: '#1A0A24' }}>{s.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Collection membership" style={{ background: '#1A0A24' }}>
                    <option value="col:" style={{ background: '#1A0A24' }}>Any collection</option>
                    {collections.map(c => (
                      <option key={c.id} value={`col:${c.id}`} style={{ background: '#1A0A24' }}>{c.name}</option>
                    ))}
                  </optgroup>
                </select>
                {task.requirement === 'collection' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', opacity: 0.6, whiteSpace: 'nowrap' }}>
                    <span>— requires</span>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(maxForTask(task), 1)}
                      value={task.requiredCount ?? 1}
                      onChange={e => changeCount(idx, e.target.value)}
                      style={{
                        width: '3rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(200,168,72,0.2)',
                        borderRadius: '0.3rem', color: CREAM, fontSize: '0.75rem',
                        padding: '0.2rem 0.35rem', outline: 'none', fontFamily: 'inherit',
                      }}
                    />
                    <span>of {maxForTask(task)} group{maxForTask(task) !== 1 ? 's' : ''}</span>
                  </span>
                )}
                {task.requirement === 'shift' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', opacity: 0.6, whiteSpace: 'nowrap' }}>
                    <span>— requires</span>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={task.requiredHours ?? 1}
                      onChange={e => changeHours(idx, e.target.value)}
                      style={{
                        width: '3.5rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(200,168,72,0.2)',
                        borderRadius: '0.3rem', color: CREAM, fontSize: '0.75rem',
                        padding: '0.2rem 0.35rem', outline: 'none', fontFamily: 'inherit',
                      }}
                    />
                    <span>hours</span>
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.68rem', opacity: 0.35, margin: 0, fontStyle: 'italic' }}>
                {reqHint(task)}
              </p>
            </div>

            {/* Move + delete */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flexShrink: 0 }}>
              <button
                onClick={() => {
                  if (idx === 0) return
                  const next = [...tasks]
                  ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                  update(next)
                }}
                disabled={idx === 0}
                title="Move up"
                style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: GOLD, opacity: idx === 0 ? 0.2 : 0.5, fontSize: '0.75rem', padding: '0.1rem' }}
              >▲</button>
              <button
                onClick={() => {
                  if (idx === tasks.length - 1) return
                  const next = [...tasks]
                  ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
                  update(next)
                }}
                disabled={idx === tasks.length - 1}
                title="Move down"
                style={{ background: 'none', border: 'none', cursor: idx === tasks.length - 1 ? 'default' : 'pointer', color: GOLD, opacity: idx === tasks.length - 1 ? 0.2 : 0.5, fontSize: '0.75rem', padding: '0.1rem' }}
              >▼</button>
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: `Remove “${task.label}”?`,
                    confirmLabel: 'Remove task',
                    danger: true,
                  })
                  if (ok) update(tasks.filter((_, i) => i !== idx))
                }}
                title="Remove"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff8a8a', opacity: 0.45, fontSize: '0.8rem', padding: '0.1rem', marginTop: '0.15rem' }}
              >✕</button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => update([
          ...tasks,
          { id: `task-${Date.now()}`, label: 'New task', requirement: 'role', enabled: true },
        ])}
        style={{
          width: '100%', padding: '0.65rem',
          border: '1px dashed rgba(210,57,248,0.25)',
          borderRadius: '0.75rem', background: 'transparent',
          color: PURPLE, fontSize: '0.8rem', letterSpacing: '0.08em',
          cursor: 'pointer', opacity: 0.6,
        }}
      >+ Add attunement task</button>

      <div style={{ minHeight: '1.2rem', marginTop: '0.75rem' }}>
        {error && <p style={{ fontSize: '0.78rem', color: '#ff8a8a', margin: 0 }}>{error}</p>}
        {!error && saved && <p style={{ fontSize: '0.72rem', color: GOLD, opacity: 0.6, margin: 0 }}>Saved ✓</p>}
      </div>

      {confirmDialog}
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { to24h } from '@/lib/time-format'
import { clockLabel } from '@/lib/shift-hours'
import { LoadError } from './LoadError'
import { LeadUpCalendar } from './LeadUpCalendar'
import { useConfirm } from '../components/ConfirmDialog'
import { TimeField } from '../components/TimeField'

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
  visible: boolean
  sort_order: number
  notified_at: string | null
  rsvp_count?: number
}

type Draft = Omit<LeadUpEvent, 'id' | 'sort_order' | 'rsvp_count' | 'notified_at'>

const blank = (): Draft => ({
  title: '', description: '', event_date: null, start_time: '', end_time: '',
  location: '', link: '', host: '', image_url: null, visible: true,
})

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.5rem', padding: '0.6rem 0.85rem', color: 'var(--cream)', fontSize: '0.875rem',
  fontFamily: 'var(--font-libre-baskerville), Georgia, serif', outline: 'none', boxSizing: 'border-box',
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

// "2026-07-08" → "Tue, Jul 8"
function formatDate(d: string | null): string {
  if (!d) return 'Date TBD'
  const dt = new Date(d + 'T00:00:00')
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function GatheringModal({ initial, isCreate, onSave, onClose, saving, error }: {
  initial: Draft
  isCreate: boolean
  onSave: (form: Draft, notify: boolean) => void
  onClose: () => void
  saving: boolean
  error: string | null
}) {
  const [form, setForm] = useState(initial)
  const [notify, setNotify] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof Draft, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageUploading(true)
    setImageError(null)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch('/api/admin/lead-up-events/image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      set('image_url', data.url)
    } catch (err: unknown) {
      setImageError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setImageUploading(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  const handleImageRemove = () => {
    const url = form.image_url
    set('image_url', null)
    // Best-effort storage cleanup; the field is already cleared regardless.
    if (url) {
      fetch('/api/admin/lead-up-events/image', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
      }).catch(() => {})
    }
  }

  // Every gathering needs a real date (so the calendar can place it) and a
  // start time — no free-text or TBD times. End stays optional.
  const canSave = !!form.title && !!form.event_date && !!form.start_time
  const missing = !form.title ? 'a title' : !form.event_date ? 'a date' : !form.start_time ? 'a start time' : null

  // A hidden gathering can't be notified, so only fan out when it's visible.
  const handleSubmit = () => onSave(form, notify && form.visible)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(95vw, 560px)', maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--ink)', border: '1px solid rgb(var(--gold-rgb) / 0.25)',
        borderRadius: '1rem', padding: '1.5rem', zIndex: 50,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--gold)', margin: 0 }}>
            {initial.title ? 'Edit gathering' : 'New lead-up gathering'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: '1.4rem', cursor: 'pointer', opacity: 0.7 }}>×</button>
        </div>

        <Field label="Title">
          <input style={inputStyle} value={form.title} placeholder="e.g. Decor brainstorm" onChange={e => set('title', e.target.value)} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 1rem' }}>
          <Field label="Date">
            <input style={inputStyle} type="date" value={form.event_date ?? ''} onChange={e => set('event_date', e.target.value || null)} />
          </Field>
          <Field label="Start">
            <TimeField value={form.start_time} onChange={v => set('start_time', v)} />
          </Field>
          <Field label="End (optional)">
            <TimeField value={form.end_time} onChange={v => set('end_time', v)} durationFrom={form.start_time} />
          </Field>
        </div>

        <Field label="Description">
          <textarea rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} value={form.description ?? ''} placeholder="What's this session for?" onChange={e => set('description', e.target.value)} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
          <Field label="Location (optional)">
            <input style={inputStyle} value={form.location ?? ''} placeholder="Physical place" onChange={e => set('location', e.target.value)} />
          </Field>
          <Field label="Link (optional)">
            <input style={inputStyle} value={form.link ?? ''} placeholder="Zoom / Meet URL" onChange={e => set('link', e.target.value)} />
          </Field>
        </div>

        <Field label="Host (optional)">
          <input style={inputStyle} value={form.host ?? ''} placeholder="Who's running it" onChange={e => set('host', e.target.value)} />
        </Field>

        <Field label="Image (optional)">
          {form.image_url ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.image_url} alt="" style={{ width: '88px', height: '64px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid rgb(var(--gold-rgb) / 0.25)' }} />
              <button type="button" onClick={handleImageRemove} style={{ background: 'none', border: '1px solid rgba(255,100,100,0.3)', borderRadius: '0.4rem', color: 'var(--danger)', cursor: 'pointer', padding: '0.3rem 0.7rem', fontSize: '0.72rem', opacity: 0.7 }}>
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={imageUploading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgb(var(--gold-rgb) / 0.08)', border: '1px dashed rgb(var(--gold-rgb) / 0.35)', borderRadius: '0.5rem', color: 'var(--gold)', cursor: 'pointer', padding: '0.5rem 0.9rem', fontSize: '0.78rem', opacity: imageUploading ? 0.5 : 0.85 }}
            >
              {imageUploading ? 'Uploading…' : '＋ Upload image'}
            </button>
          )}
          <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageUpload} style={{ display: 'none' }} />
          {imageError && <p style={{ color: 'var(--danger)', fontSize: '0.72rem', marginTop: '0.4rem' }}>{imageError}</p>}
        </Field>

        <div style={{ marginBottom: isCreate ? '0.75rem' : '1.25rem' }}>
          <Toggle checked={form.visible} onChange={v => set('visible', v)} label="Visible to members" />
        </div>

        {isCreate && (
          <div style={{ marginBottom: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid rgb(var(--gold-rgb) / 0.1)' }}>
            {form.visible ? (
              <Toggle checked={notify} onChange={setNotify} label="Notify members on save (bell + email)" />
            ) : (
              <p style={{ fontSize: '0.76rem', opacity: 0.4, margin: 0 }}>Turn on “Visible to members” to alert members on save.</p>
            )}
          </div>
        )}

        {error && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
          {missing && (
            <span style={{ fontSize: '0.72rem', color: 'var(--gold)', opacity: 0.55, fontStyle: 'italic', marginRight: 'auto' }}>
              Needs {missing}
            </span>
          )}
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'transparent', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.82rem', opacity: 0.7 }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving || !canSave} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.45)', background: 'transparent', color: 'var(--lemon)', cursor: 'pointer', fontSize: '0.82rem', letterSpacing: '0.05em', opacity: saving || !canSave ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save gathering'}
          </button>
        </div>
      </div>
    </>
  )
}

export function LeadUpGatheringsManager({ rangeStart, rangeEnd, initialEvents }: {
  rangeStart?: string
  rangeEnd?: string
  // Server-rendered pages pass this (docs/architecture.md → Auth → "Server-
  // rendered section data") so the list paints populated; the mount fetch
  // below runs only when it's absent. The API route stays the refresh path.
  initialEvents?: LeadUpEvent[]
}) {
  const [events, setEvents] = useState<LeadUpEvent[]>(initialEvents ?? [])
  const [loading, setLoading] = useState(initialEvents === undefined)
  const [loadError, setLoadError] = useState(false)
  const [modal, setModal] = useState<{ mode: 'add'; date?: string } | { mode: 'edit'; event: LeadUpEvent } | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [notifyingId, setNotifyingId] = useState<string | null>(null)
  const [notifyResult, setNotifyResult] = useState<{ id: string; text: string } | null>(null)
  // List-level failures (delete / visibility toggle) — the modal and notify
  // flows have their own error surfaces (modalError / notifyResult).
  const [actionError, setActionError] = useState<string | null>(null)
  const { confirm, confirmDialog } = useConfirm()

  const load = async () => {
    setLoadError(false)
    try {
      const res = await fetch('/api/admin/lead-up-events')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setEvents(json.events)
    } catch {
      setLoadError(true)
    }
    setLoading(false)
  }

  useEffect(() => { if (initialEvents === undefined) load() }, [])

  const handleSave = async (form: Draft, notify = false) => {
    setSaving(true)
    setModalError(null)
    try {
      let res: Response
      if (modal?.mode === 'edit') {
        res = await fetch(`/api/admin/lead-up-events/${modal.event.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        })
      } else {
        res = await fetch('/api/admin/lead-up-events', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        })
      }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }

      // New gatherings can fan out the alert immediately if requested.
      if (modal?.mode === 'add' && notify) {
        const created = (await res.json()).event
        if (created?.id) {
          const nres = await fetch(`/api/admin/lead-up-events/${created.id}/notify`, { method: 'POST' })
          const ndata = await nres.json().catch(() => ({}))
          setNotifyResult({
            id: created.id,
            text: nres.ok ? `Notified ${ndata.notified} · emailed ${ndata.emailed}` : (ndata.error || 'Saved, but notify failed'),
          })
        }
      }

      await load()
      setModal(null)
    } catch (e: unknown) {
      setModalError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const ev = events.find(e => e.id === id)
    const ok = await confirm({
      title: `Delete ${ev ? `“${ev.title}”` : 'this gathering'}?`,
      body: 'Its RSVPs will be removed too.',
      confirmLabel: 'Delete gathering',
      danger: true,
    })
    if (!ok) return
    setActionError(null)
    const res = await fetch(`/api/admin/lead-up-events/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {}
      setActionError(data.error ?? 'Something went wrong — the gathering was not deleted.')
      return
    }
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  const handleNotify = async (event: LeadUpEvent) => {
    if (!event.visible) {
      await confirm({
        title: 'This gathering is still hidden',
        body: 'Make it visible before notifying members.',
        notice: true,
      })
      return
    }
    const already = !!event.notified_at
    const ok = await confirm({
      title: already ? `Re-send the alert for “${event.title}”?` : `Alert all members about “${event.title}”?`,
      body: already
        ? "Everyone will get another bell notification and email."
        : "Everyone will get a bell notification and an email (members who turned off announcement emails won't be emailed).",
      confirmLabel: already ? 'Re-send alert' : 'Notify members',
    })
    if (!ok) return

    setNotifyingId(event.id)
    setNotifyResult(null)
    try {
      const res = await fetch(`/api/admin/lead-up-events/${event.id}/notify`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, notified_at: data.notified_at } : e))
      setNotifyResult({ id: event.id, text: `Notified ${data.notified} · emailed ${data.emailed}` })
    } catch (e: unknown) {
      setNotifyResult({ id: event.id, text: e instanceof Error ? e.message : 'Failed to notify' })
    } finally {
      setNotifyingId(null)
    }
  }

  const handleToggleVisible = async (event: LeadUpEvent) => {
    setActionError(null)
    const res = await fetch(`/api/admin/lead-up-events/${event.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: !event.visible }),
    }).catch(() => null)
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {}
      setActionError(data.error ?? 'Something went wrong — visibility was not changed.')
      return
    }
    setEvents(prev => prev.map(e => e.id === event.id ? { ...e, visible: !e.visible } : e))
  }

  const addBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.5rem 1rem', borderRadius: '9999px',
    border: '1px solid rgb(var(--gold-rgb) / 0.25)', background: 'transparent',
    color: 'var(--gold)', cursor: 'pointer', fontSize: '0.78rem',
    letterSpacing: '0.06em', opacity: 0.75,
  }

  if (loading) return <p style={{ opacity: 0.4, fontStyle: 'italic', fontSize: '0.875rem' }}>Loading…</p>
  if (loadError) return <LoadError onRetry={() => { setLoading(true); load() }} />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.78rem', opacity: 0.45, lineHeight: 1.6, margin: 0, flex: '1 1 14rem' }}>
          Planning &amp; brainstorming sessions on the runway to the event. Members RSVP per session — these are separate from the at-camp schedule and never affect shifts or attunement.
        </p>
        <button style={addBtnStyle} onClick={() => { setModal({ mode: 'add' }); setModalError(null) }}>
          + Add gathering
        </button>
      </div>

      {/* Month calendar — the runway at a glance. Click an empty day to add a
          gathering there; click a gathering to edit it. */}
      <LeadUpCalendar
        events={events}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        onAddDate={iso => { setModal({ mode: 'add', date: iso }); setModalError(null) }}
        onEdit={ev => { setModal({ mode: 'edit', event: ev }); setModalError(null) }}
      />

      {actionError && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '0 0 0.6rem' }}>{actionError}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {events.length === 0 && <p style={{ opacity: 0.35, fontStyle: 'italic', fontSize: '0.82rem' }}>No gatherings yet.</p>}
        {events.map(ev => {
          // Local calendar date (en-CA = YYYY-MM-DD) so "today" isn't past.
          const isPast = !!ev.event_date && ev.event_date < new Date().toLocaleDateString('en-CA')
          return (
          <div
            key={ev.id}
            style={{
              // flexWrap: on phone widths the RSVP/action cluster drops to its
              // own line instead of crushing the title column to a sliver
              display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
              padding: '0.75rem 1rem', borderRadius: '0.65rem',
              border: '1px solid rgb(var(--gold-rgb) / 0.12)',
              background: ev.visible ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.005)',
              opacity: !ev.visible ? 0.5 : isPast ? 0.6 : 1,
            }}
          >
            <div style={{
              flexShrink: 0, width: '70px', textAlign: 'center',
              padding: '0.35rem 0.4rem', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
              borderRadius: '0.5rem', background: 'rgb(var(--gold-rgb) / 0.06)',
            }}>
              <p style={{ fontSize: '0.62rem', color: 'var(--gold)', margin: 0, letterSpacing: '0.03em' }}>{formatDate(ev.event_date)}</p>
            </div>

            <div style={{ flex: '1 1 11rem', minWidth: 0 }}>
              <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--cream)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ev.title}
                {isPast && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream)', opacity: 0.45, border: '1px solid rgb(var(--cream-rgb) / 0.2)', borderRadius: '9999px', padding: '0.1rem 0.5rem', verticalAlign: 'middle' }}>
                    Past
                  </span>
                )}
              </p>
              <p style={{ fontSize: '0.7rem', opacity: 0.45, margin: '0.15rem 0 0' }}>
                {[clockLabel(ev.start_time), ev.location || (ev.link ? 'Online' : null), ev.host].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>

            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem', minWidth: '64px' }}>
              <span title="RSVPs" style={{ fontSize: '0.72rem', color: 'var(--gold)', opacity: 0.7, border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '9999px', padding: '0.15rem 0.55rem' }}>
                {ev.rsvp_count ?? 0} going
              </span>
              {notifyResult?.id === ev.id ? (
                <span style={{ fontSize: '0.62rem', opacity: 0.55, textAlign: 'right' }}>{notifyResult.text}</span>
              ) : ev.notified_at ? (
                <span style={{ fontSize: '0.62rem', opacity: 0.4, textAlign: 'right' }}>Notified {new Date(ev.notified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, marginLeft: 'auto' }}>
              {/* No alerting members about a gathering that already happened. */}
              {!isPast && (
              <button
                onClick={() => handleNotify(ev)}
                disabled={notifyingId === ev.id}
                title={ev.notified_at ? 'Re-send alert to members' : 'Alert all members (bell + email)'}
                style={{
                  background: ev.notified_at ? 'none' : 'rgb(var(--gold-rgb) / 0.1)',
                  border: '1px solid rgb(var(--gold-rgb) / 0.3)', borderRadius: '0.4rem',
                  color: 'var(--gold)', cursor: 'pointer', padding: '0.25rem 0.55rem',
                  fontSize: '0.7rem', opacity: notifyingId === ev.id ? 0.4 : ev.notified_at ? 0.55 : 0.9, whiteSpace: 'nowrap',
                }}
              >
                {notifyingId === ev.id ? 'Sending…' : ev.notified_at ? '↻ Notify' : '🔔 Notify'}
              </button>
              )}
              <button onClick={() => handleToggleVisible(ev)} title={ev.visible ? 'Visible to members — click to hide' : 'Hidden from members — click to show'} aria-label={ev.visible ? 'Visible to members — click to hide' : 'Hidden from members — click to show'} style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.4rem', color: 'var(--gold)', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.6 }}>
                {ev.visible ? '●' : '○'}
              </button>
              <button onClick={() => { setModal({ mode: 'edit', event: ev }); setModalError(null) }} style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.4rem', color: 'var(--gold)', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.6 }}>
                Edit
              </button>
              <button onClick={() => handleDelete(ev.id)} style={{ background: 'none', border: '1px solid rgba(255,100,100,0.2)', borderRadius: '0.4rem', color: 'var(--danger)', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.5 }}>
                ✕
              </button>
            </div>
          </div>
          )
        })}
      </div>

      {modal && (
        <GatheringModal
          initial={modal.mode === 'edit'
            // Legacy rows store display strings ("7:00 PM") — snap them to the
            // "HH:MM" the time inputs speak; unparseable values start blank.
            ? { title: modal.event.title, description: modal.event.description, event_date: modal.event.event_date, start_time: to24h(modal.event.start_time), end_time: to24h(modal.event.end_time), location: modal.event.location, link: modal.event.link, host: modal.event.host, image_url: modal.event.image_url, visible: modal.event.visible }
            : { ...blank(), event_date: modal.date ?? null }}
          isCreate={modal.mode === 'add'}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
          error={modalError}
        />
      )}

      {confirmDialog}
    </div>
  )
}

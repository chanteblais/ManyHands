'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  ATTENDANCE_OPTIONS,
  MEMBERSHIP_TYPE_OPTIONS,
  RIDESHARE_OPTIONS,
} from '@/lib/application-options'

type ApplicationData = {
  id: string
  status: string
  preferred_name?: string | null
  pronouns?: string | null
  phone?: string | null
  instagram?: string | null
  location?: string | null
  attendance?: string | null
  arrival_date?: string | null
  departure_date?: string | null
  membership_type?: string | null
  vehicle?: string | null
  space_requirements?: string | null
  structures?: string | null
  rideshare?: string | null
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'rgba(255,255,255,0.05)',
  border: '1px solid rgb(var(--gold-rgb) / 0.25)',
  borderRadius: '0.5rem',
  padding: '0.75rem 1rem',
  color: 'var(--cream)',
  fontSize: '0.9rem',
  fontFamily: 'var(--font-libre-baskerville), Georgia, serif',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  letterSpacing: '0.1em',
  color: 'var(--gold)',
  marginBottom: '0.45rem',
  textTransform: 'uppercase',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

export function ProfileSettings({ application, suspended = false }: { application: ApplicationData; suspended?: boolean }) {
  const router = useRouter()
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'edit' | 'cancel' | 'suspend' | 'resume' | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [suspendNote, setSuspendNote] = useState('')

  const [form, setForm] = useState({
    preferred_name: application.preferred_name ?? '',
    pronouns: application.pronouns ?? '',
    phone: application.phone ?? '',
    instagram: application.instagram ?? '',
    location: application.location ?? '',
    attendance: application.attendance ?? '',
    arrival_date: application.arrival_date ?? '',
    departure_date: application.departure_date ?? '',
    membership_type: application.membership_type ?? '',
    vehicle: application.vehicle ?? '',
    space_requirements: application.space_requirements ?? '',
    structures: application.structures ?? '',
    rideshare: application.rideshare ?? '',
  })

  useEffect(() => {
    setForm({
      preferred_name: application.preferred_name ?? '',
      pronouns: application.pronouns ?? '',
      phone: application.phone ?? '',
      instagram: application.instagram ?? '',
      location: application.location ?? '',
      attendance: application.attendance ?? '',
      arrival_date: application.arrival_date ?? '',
      departure_date: application.departure_date ?? '',
      membership_type: application.membership_type ?? '',
      vehicle: application.vehicle ?? '',
      space_requirements: application.space_requirements ?? '',
      structures: application.structures ?? '',
      rideshare: application.rideshare ?? '',
    })
  }, [application])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (view !== 'menu') return
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setView(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [view])

  useEffect(() => {
    function handleOpenSettings(e: Event) {
      const section = (e as CustomEvent).detail?.section as 'photo' | 'contribution' | undefined
      if (section === 'photo') {
        // Photo is the avatar on the page — just scroll to it
        document.getElementById('avatar-upload')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        document.getElementById('avatar-upload')?.click()
        return
      }
      setMenuOpen(false)
      setView('edit')
      setError(null)
      setSuccess(null)
      if (section) {
        setTimeout(() => {
          const el = document.getElementById(`settings-field-${section}`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }
    }
    window.addEventListener('glaum:open-settings', handleOpenSettings)
    return () => window.removeEventListener('glaum:open-settings', handleOpenSettings)
  }, [])

  const closeAll = () => {
    setMenuOpen(false)
    setView(null)
    setError(null)
    setSuccess(null)
  }

  const openPanel = (next: 'edit' | 'cancel' | 'suspend' | 'resume') => {
    setMenuOpen(false)
    setView(next)
    setError(null)
    setSuccess(null)
    if (next === 'cancel') setCancelReason('')
    if (next === 'suspend') setSuspendNote('')
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/profile/application', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save changes')

      setSuccess('Your profile has been updated.')
      router.refresh()
      setTimeout(() => closeAll(), 1200)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async () => {
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/profile/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to cancel attendance')

      router.refresh()
      closeAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const handleSuspendToggle = async (nextSuspended: boolean) => {
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/profile/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspended: nextSuspended, note: suspendNote.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')

      router.refresh()
      closeAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const canEdit = application.status === 'approved' || application.status === 'pending'
  const cancelReasonOk = cancelReason.trim().length >= 10

  if (!canEdit) return null

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Profile settings"
        aria-expanded={menuOpen || view !== null}
        onClick={() => {
          if (view && view !== 'menu') {
            setView('menu')
            setMenuOpen(true)
            return
          }
          setMenuOpen((open) => !open)
          setView((v) => (v ? null : 'menu'))
        }}
        style={{
          width: '2.25rem',
          height: '2.25rem',
          borderRadius: '9999px',
          border: '1px solid rgb(var(--gold-rgb) / 0.35)',
          background: 'rgba(255,255,255,0.04)',
          color: 'var(--gold)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {menuOpen && view === 'menu' && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.5rem)',
            right: 0,
            minWidth: '12rem',
            border: '1px solid rgb(var(--gold-rgb) / 0.25)',
            borderRadius: '0.75rem',
            background: 'var(--ink)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            overflow: 'hidden',
            zIndex: 20,
          }}
        >
          <button
            type="button"
            onClick={() => openPanel('edit')}
            style={menuItemStyle}
          >
            Edit profile
          </button>
          <button
            type="button"
            onClick={() => openPanel(suspended ? 'resume' : 'suspend')}
            style={{ ...menuItemStyle, color: 'var(--gold)', borderTop: '1px solid rgb(var(--gold-rgb) / 0.12)' }}
          >
            {suspended ? 'Resume attendance' : 'Suspend attendance'}
          </button>
          <button
            type="button"
            onClick={() => openPanel('cancel')}
            style={{ ...menuItemStyle, color: 'var(--danger)', borderTop: '1px solid rgb(var(--gold-rgb) / 0.12)' }}
          >
            Cancel attendance
          </button>
        </div>
      )}

      {view === 'edit' && (
        <Panel title="Edit profile" onClose={closeAll}>
          <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
            <Field label="Preferred name">
              <input
                style={inputStyle}
                value={form.preferred_name}
                onChange={(e) => setForm({ ...form, preferred_name: e.target.value })}
              />
            </Field>
            <Field label="Pronouns">
              <input
                style={inputStyle}
                value={form.pronouns}
                onChange={(e) => setForm({ ...form, pronouns: e.target.value })}
              />
            </Field>
          </div>

          {/* About / Skills are edited in the Profile Details card (they save to
              the canonical member_profiles values), not here. */}

          <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
            <Field label="Phone">
              <input
                style={inputStyle}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Instagram">
              <input
                style={inputStyle}
                value={form.instagram}
                onChange={(e) => setForm({ ...form, instagram: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Traveling from">
            <input
              style={inputStyle}
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </Field>

          <Field label="Attendance">
            <select
              style={inputStyle}
              value={form.attendance}
              onChange={(e) => setForm({ ...form, attendance: e.target.value })}
            >
              <option value="">Select…</option>
              {ATTENDANCE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>

          <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>
            <Field label="Arrival">
              <input
                style={inputStyle}
                value={form.arrival_date}
                onChange={(e) => setForm({ ...form, arrival_date: e.target.value })}
              />
            </Field>
            <Field label="Departure">
              <input
                style={inputStyle}
                value={form.departure_date}
                onChange={(e) => setForm({ ...form, departure_date: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Camp membership type">
            <select
              style={inputStyle}
              value={form.membership_type}
              onChange={(e) => setForm({ ...form, membership_type: e.target.value })}
            >
              <option value="">Select…</option>
              {MEMBERSHIP_TYPE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>

          <Field label="Vehicle">
            <input
              style={inputStyle}
              value={form.vehicle}
              onChange={(e) => setForm({ ...form, vehicle: e.target.value })}
            />
          </Field>

          <Field label="Space requirements">
            <input
              style={inputStyle}
              value={form.space_requirements}
              onChange={(e) => setForm({ ...form, space_requirements: e.target.value })}
            />
          </Field>

          <Field label="Structures">
            <input
              style={inputStyle}
              value={form.structures}
              onChange={(e) => setForm({ ...form, structures: e.target.value })}
            />
          </Field>

          <Field label="Rideshare">
            <select
              style={inputStyle}
              value={form.rideshare}
              onChange={(e) => setForm({ ...form, rideshare: e.target.value })}
            >
              <option value="">Select…</option>
              {RIDESHARE_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </Field>

          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}
          {success && <p style={{ color: '#8fd48f', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{success}</p>}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={closeAll} style={secondaryBtnStyle}>Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving} style={primaryBtnStyle}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </Panel>
      )}

      {view === 'cancel' && (
        <Panel title="Cancel attendance" onClose={closeAll}>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--cream)', opacity: 0.9, marginBottom: '1.25rem' }}>
            We're sorry to see you go. Please share why you're cancelling so the camp can plan accordingly.
          </p>
          <Field label="Reason (required)">
            <textarea
              rows={5}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Tell us what's changed…"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
            <p style={{ fontSize: '0.78rem', color: cancelReasonOk ? 'var(--success)' : 'var(--cream)', opacity: cancelReasonOk ? 0.9 : 0.75, marginTop: '0.5rem', marginBottom: 0 }}>
              {cancelReasonOk
                ? '✓ Thank you — this helps us plan.'
                : `Please write at least 10 characters before confirming (${cancelReason.trim().length}/10).`}
            </p>
          </Field>
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={closeAll} style={secondaryBtnStyle}>Keep my spot</button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving || !cancelReasonOk}
              style={{
                ...primaryBtnStyle,
                borderColor: 'rgba(255,120,120,0.5)',
                color: 'var(--danger-soft)',
                opacity: saving || !cancelReasonOk ? 0.45 : 1,
                cursor: saving || !cancelReasonOk ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Cancelling…' : 'Confirm cancellation'}
            </button>
          </div>
        </Panel>
      )}

      {view === 'suspend' && (
        <Panel title="Suspend attendance" onClose={closeAll}>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--cream)', opacity: 0.9, marginBottom: '1rem' }}>
            Life happens. Suspending pauses your commitments while you stay part of the community — you'll keep full access to the site, the schedule, and messages.
          </p>
          <div style={{ padding: '1rem 1.25rem', border: '1px solid rgba(255,180,80,0.3)', borderRadius: '0.75rem', background: 'rgba(255,180,80,0.06)', marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--warning)', marginBottom: '0.6rem' }}>
              What happens
            </p>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li style={{ fontSize: '0.85rem', lineHeight: 1.5, opacity: 0.85 }}>You'll be released from all your commitments — your role, groups, shifts, and anything you're bringing.</li>
              <li style={{ fontSize: '0.85rem', lineHeight: 1.5, opacity: 0.85 }}>You won't be able to take on new commitments until you resume.</li>
              <li style={{ fontSize: '0.85rem', lineHeight: 1.5, opacity: 0.85 }}>You can resume anytime from this same menu.</li>
            </ul>
          </div>
          <Field label="Note to organizers (optional)">
            <textarea
              rows={3}
              value={suspendNote}
              onChange={(e) => setSuspendNote(e.target.value)}
              placeholder="Anything you'd like the organizers to know…"
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
          </Field>
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={closeAll} style={secondaryBtnStyle}>Never mind</button>
            <button
              type="button"
              onClick={() => handleSuspendToggle(true)}
              disabled={saving}
              style={{
                ...primaryBtnStyle,
                borderColor: 'rgba(255,180,80,0.5)',
                color: 'var(--warning)',
                opacity: saving ? 0.45 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Suspending…' : 'Suspend my attendance'}
            </button>
          </div>
        </Panel>
      )}

      {view === 'resume' && (
        <Panel title="Resume attendance" onClose={closeAll}>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: 'var(--cream)', opacity: 0.9, marginBottom: '1.25rem' }}>
            Welcome back! Resuming lifts your suspension right away. Your previous commitments aren't restored automatically — head to Participate to pick up your role, groups, shifts, and anything you'd like to bring.
          </p>
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={closeAll} style={secondaryBtnStyle}>Not yet</button>
            <button
              type="button"
              onClick={() => handleSuspendToggle(false)}
              disabled={saving}
              style={{
                ...primaryBtnStyle,
                opacity: saving ? 0.45 : 1,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Resuming…' : 'Resume my attendance'}
            </button>
          </div>
        </Panel>
      )}
    </div>
  )
}

function Panel({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return createPortal(
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 200,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(92vw, 640px)',
          maxHeight: '85vh',
          overflowY: 'auto',
          border: '1px solid rgb(var(--gold-rgb) / 0.25)',
          borderRadius: '1rem',
          background: 'var(--ink)',
          padding: '1.5rem',
          zIndex: 201,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--gold)', margin: 0 }}>
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" style={closeBtnStyle}>×</button>
        </div>
        {children}
      </div>
    </>,
    document.body
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.85rem 1rem',
  border: 'none',
  background: 'transparent',
  color: 'var(--cream)',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: '0.85rem',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.65rem 1.25rem',
  borderRadius: '9999px',
  border: '1px solid rgb(var(--gold-rgb) / 0.45)',
  background: 'transparent',
  color: 'var(--lemon)',
  cursor: 'pointer',
  fontSize: '0.82rem',
  letterSpacing: '0.06em',
}

const secondaryBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  borderColor: 'rgb(var(--gold-rgb) / 0.2)',
  color: 'var(--cream)',
  opacity: 0.75,
}

const closeBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--gold)',
  fontSize: '1.5rem',
  lineHeight: 1,
  cursor: 'pointer',
  opacity: 0.7,
}

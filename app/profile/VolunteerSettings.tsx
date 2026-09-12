'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type VolunteerData = {
  id: string
  phone: string | null
  days_available: string[]
  preferred_times: string[]
  shift_interests: string[]
  other_notes: string | null
  signup_intent: string[] | null
}

const SIGNUP_INTENT_OPTIONS = [
  { value: 'shift', label: 'Sign up for a shift', description: 'Help out during a specific time slot.' },
  { value: 'role', label: 'Take on a camp role', description: 'Take on a defined responsibility for the event.' },
  { value: 'other', label: 'Something else', description: "Not sure yet, or something else entirely." },
]

const DAYS = [
  'Tuesday, Jul 22 — Setup day',
  'Wednesday, Jul 23',
  'Thursday, Jul 24',
  'Friday, Jul 25',
  'Saturday, Jul 26',
  'Sunday, Jul 27 — Teardown',
]

const TIMES = ['Morning', 'Afternoon', 'Evening', 'Flexible']

const SHIFT_INTERESTS = [
  'Welcoming & hosting',
  'Setup & build',
  'Teardown & strike',
  'Kitchen & food',
  'Decor & ambiance',
  'Programming & activities',
  'Cleanup',
  'General help',
]

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

export function VolunteerSettings({ volunteer }: { volunteer: VolunteerData }) {
  const router = useRouter()
  const menuRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<'menu' | 'edit' | 'cancel' | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [form, setForm] = useState<{
    phone: string
    days_available: string[]
    preferred_times: string[]
    shift_interests: string[]
    other_notes: string
    signup_intent: string[]
  }>({
    phone: volunteer.phone ?? '',
    days_available: volunteer.days_available ?? [],
    preferred_times: volunteer.preferred_times ?? [],
    shift_interests: volunteer.shift_interests ?? [],
    other_notes: volunteer.other_notes ?? '',
    signup_intent: volunteer.signup_intent ?? [],
  })

  const closeAll = () => { setView(null); setError(null); setSuccess(null); setCancelReason('') }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        if (view === 'menu') closeAll()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [view])

  const toggle = (field: 'days_available' | 'preferred_times' | 'shift_interests' | 'signup_intent', value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/volunteer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
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
      const res = await fetch('/api/volunteer', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to cancel')
      router.refresh()
      closeAll()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Volunteer settings"
        aria-expanded={view !== null}
        onClick={() => {
          if (view === 'edit') { setView('menu'); return }
          setView((v) => v ? null : 'menu')
          setError(null)
          setSuccess(null)
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
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {view === 'menu' && (
        <div style={{
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
        }}>
          <button
            type="button"
            onClick={() => { setView('edit'); setError(null); setSuccess(null) }}
            style={{ display: 'block', width: '100%', padding: '0.85rem 1rem', border: 'none', background: 'transparent', color: 'var(--cream)', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Edit profile
          </button>
          <button
            type="button"
            onClick={() => { setView('cancel'); setError(null) }}
            style={{ display: 'block', width: '100%', padding: '0.85rem 1rem', border: 'none', borderTop: '1px solid rgb(var(--gold-rgb) / 0.12)', background: 'transparent', color: 'var(--danger)', textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Cancel signup
          </button>
        </div>
      )}

      {view === 'edit' && (
        <>
          <div
            onClick={closeAll}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30 }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(92vw, 580px)',
            maxHeight: '85vh',
            overflowY: 'auto',
            border: '1px solid rgb(var(--gold-rgb) / 0.25)',
            borderRadius: '1rem',
            background: 'var(--ink)',
            padding: '1.5rem',
            zIndex: 40,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--gold)', margin: 0 }}>
                Edit volunteer info
              </h2>
              <button type="button" onClick={closeAll} aria-label="Close" style={{ border: 'none', background: 'transparent', color: 'var(--gold)', fontSize: '1.5rem', lineHeight: 1, cursor: 'pointer', opacity: 0.7 }}>×</button>
            </div>

            <Field label="How would you like to contribute?">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {SIGNUP_INTENT_OPTIONS.map(opt => {
                  const checked = form.signup_intent.includes(opt.value)
                  return (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', padding: '0.7rem 0.85rem', borderRadius: '0.5rem', border: `1px solid ${checked ? 'rgb(var(--purple-rgb) / 0.4)' : 'rgb(var(--gold-rgb) / 0.12)'}`, background: checked ? 'rgb(var(--purple-rgb) / 0.06)' : 'transparent', transition: 'border-color 0.15s' }}>
                      <input
                        type="checkbox"
                        value={opt.value}
                        checked={checked}
                        onChange={() => toggle('signup_intent', opt.value)}
                        style={{ marginTop: '0.2rem', flexShrink: 0, accentColor: 'var(--purple)', cursor: 'pointer' }}
                      />
                      <div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--cream)', marginBottom: '0.1rem' }}>{opt.label}</p>
                        <p style={{ fontSize: '0.75rem', opacity: 0.45, lineHeight: 1.4 }}>{opt.description}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </Field>

            <Field label="Phone">
              <input
                style={inputStyle}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Optional"
              />
            </Field>

            <Field label="Days available">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {DAYS.map((day) => (
                  <label key={day} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.days_available.includes(day)}
                      onChange={() => toggle('days_available', day)}
                      style={{ accentColor: 'var(--purple)' }}
                    />
                    {day}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Preferred times">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                {TIMES.map((t) => (
                  <label key={t} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.preferred_times.includes(t)}
                      onChange={() => toggle('preferred_times', t)}
                      style={{ accentColor: 'var(--purple)' }}
                    />
                    {t}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Shift interests">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {SHIFT_INTERESTS.map((s) => (
                  <label key={s} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.shift_interests.includes(s)}
                      onChange={() => toggle('shift_interests', s)}
                      style={{ accentColor: 'var(--purple)' }}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Other notes">
              <textarea
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
                value={form.other_notes}
                onChange={(e) => setForm({ ...form, other_notes: e.target.value })}
                placeholder="Anything else we should know…"
              />
            </Field>

            {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}
            {success && <p style={{ color: '#8fd48f', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{success}</p>}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={closeAll} style={{ padding: '0.65rem 1.25rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'transparent', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.82rem', opacity: 0.75 }}>
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving} style={{ padding: '0.65rem 1.25rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.45)', background: 'transparent', color: 'var(--lemon)', cursor: 'pointer', fontSize: '0.82rem', letterSpacing: '0.06em' }}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </>
      )}

      {view === 'cancel' && (
        <>
          <div onClick={closeAll} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 30 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 'min(92vw, 480px)', border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '1rem',
            background: 'var(--ink)', padding: '1.5rem', zIndex: 40, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--gold)', margin: 0 }}>Cancel signup</h2>
              <button type="button" onClick={closeAll} aria-label="Close" style={{ border: 'none', background: 'transparent', color: 'var(--gold)', fontSize: '1.5rem', lineHeight: 1, cursor: 'pointer', opacity: 0.7 }}>×</button>
            </div>
            <p style={{ fontSize: '0.9rem', lineHeight: 1.7, opacity: 0.7, marginBottom: '1.25rem' }}>
              No worries — plans change. You can always sign up again later.
            </p>
            {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" onClick={closeAll} style={{ padding: '0.65rem 1.25rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'transparent', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.82rem', opacity: 0.75 }}>
                Keep my spot
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                style={{ padding: '0.65rem 1.25rem', borderRadius: '9999px', border: '1px solid rgba(255,120,120,0.5)', background: 'transparent', color: 'var(--danger-soft)', cursor: 'pointer', fontSize: '0.82rem', letterSpacing: '0.06em' }}
              >
                {saving ? 'Cancelling…' : 'Confirm cancellation'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

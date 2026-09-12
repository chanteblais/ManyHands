'use client'

import { useState } from 'react'

export function ShiftSignupToggle({ initialOpen }: { initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    const next = !open
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/page-content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_shift_signup_open: String(next) }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to save')
      } else {
        setOpen(next)
      }
    } catch {
      setError('Network error')
    }
    setSaving(false)
  }

  // Compact pill in the schedule's controls row (same pill language as the
  // List ⇄ Week toggle) — the closed state's explanation surfaces below only
  // when it matters.
  return (
    <div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
        padding: '0.4rem 0.9rem', borderRadius: '9999px',
        border: `1px solid ${open ? 'rgb(var(--gold-rgb) / 0.25)' : 'rgba(255,80,80,0.35)'}`,
        background: open ? 'rgb(var(--gold-rgb) / 0.04)' : 'rgba(255,80,80,0.06)',
      }}>
        <span style={{ fontSize: '0.72rem', letterSpacing: '0.08em', color: open ? 'var(--gold)' : 'var(--danger-strong)', whiteSpace: 'nowrap' }}>
          Shift signup {open ? 'open' : 'closed'}
        </span>
        <button
          onClick={toggle}
          disabled={saving}
          aria-pressed={open}
          title={open
            ? 'Members can choose and change their shifts.'
            : 'The shift picker is hidden from members until times are confirmed. Existing shifts can still be cancelled.'}
          style={{
            width: '34px', height: '18px', borderRadius: '9999px', flexShrink: 0,
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: open ? 'var(--gold)' : 'rgba(255,80,80,0.6)',
            transition: 'background 0.2s', position: 'relative', opacity: saving ? 0.5 : 1,
          }}
        >
          <div style={{
            position: 'absolute', top: '3px', left: open ? '19px' : '3px',
            width: '12px', height: '12px', borderRadius: '50%',
            background: 'var(--ink)', transition: 'left 0.2s',
          }} />
        </button>
      </div>
      {!open && (
        <p style={{ fontSize: '0.72rem', opacity: 0.5, margin: '0.4rem 0 0', maxWidth: '30rem' }}>
          The shift picker is hidden from members until times are confirmed. Existing shifts can still be cancelled.
        </p>
      )}
      {error && <p style={{ fontSize: '0.78rem', color: 'var(--danger)', margin: '0.5rem 0 0' }}>{error}</p>}
    </div>
  )
}

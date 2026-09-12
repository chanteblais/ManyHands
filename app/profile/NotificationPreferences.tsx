'use client'

import { useEffect, useState } from 'react'

type Prefs = {
  email_new_message: boolean
  email_announcements: boolean
  email_application: boolean
  email_attunement_nudges: boolean
  email_event_reminders: boolean
}

const TOGGLES: { key: keyof Prefs; label: string; description: string }[] = [
  {
    key: 'email_new_message',
    label: 'New messages',
    description: 'Email me when another member sends me a message.',
  },
  {
    key: 'email_announcements',
    label: 'Announcements',
    description: 'Email me about camp-wide announcements and updates.',
  },
  {
    key: 'email_application',
    label: 'Application updates',
    description: 'Email me when my application status changes.',
  },
  {
    key: 'email_attunement_nudges',
    label: 'Attunement reminders',
    description: 'Email me reminders while I have outstanding attunement tasks.',
  },
  {
    key: 'email_event_reminders',
    label: 'Gathering & shift reminders',
    description: 'Confirm my sign-ups and remind me before the gatherings and shifts I join.',
  },
]

function PrefCheckbox({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
  disabled?: boolean
}) {
  return (
    <label
      className="notif-pref-row"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.9rem',
        padding: '0.85rem 0',
        cursor: disabled ? 'wait' : 'pointer',
        borderBottom: '1px solid rgb(var(--gold-rgb) / 0.1)',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={e => onChange(e.target.checked)}
        style={{
          flexShrink: 0,
          width: '18px',
          height: '18px',
          marginTop: '0.15rem',
          accentColor: 'var(--purple)',
          cursor: disabled ? 'wait' : 'pointer',
        }}
      />
      <span style={{ flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: '0.92rem',
            color: 'var(--cream)',
            fontFamily: 'var(--font-cormorant-garamond), Georgia, serif',
            marginBottom: '0.15rem',
          }}
        >
          {label}
        </span>
        <span style={{ display: 'block', fontSize: '0.78rem', color: 'rgb(var(--cream-rgb) / 0.6)', lineHeight: 1.5 }}>
          {description}
        </span>
      </span>
    </label>
  )
}

export function NotificationPreferences({ initialPrefs }: { initialPrefs?: Prefs } = {}) {
  const [prefs, setPrefs] = useState<Prefs | null>(initialPrefs ?? null)
  const [saving, setSaving] = useState<keyof Prefs | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    if (initialPrefs != null) return // server already provided them
    fetch('/api/profile/notifications', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setPrefs(d.preferences ?? null))
      .catch(() => setError('Could not load your preferences.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function update(key: keyof Prefs, value: boolean) {
    if (!prefs) return
    const prev = prefs
    setPrefs({ ...prefs, [key]: value }) // optimistic
    setSaving(key)
    setError(null)
    try {
      const res = await fetch('/api/profile/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      if (data.preferences) setPrefs(data.preferences)
      setSavedAt(Date.now())
    } catch (err) {
      setPrefs(prev) // revert
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  return (
    <section
      id="notifications"
      style={{
        scrollMarginTop: '6rem',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgb(var(--gold-rgb) / 0.15)',
        borderRadius: '1rem',
        padding: '1.5rem 1.6rem',
        marginBottom: '2.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.15rem',
            color: 'var(--gold)',
            margin: 0,
            textShadow: '0 2px 8px rgba(0,0,0,0.8)',
          }}
        >
          Notification Preferences
        </h2>
        {savedAt && !error && (
          <span style={{ fontSize: '0.72rem', color: 'var(--success)', opacity: 0.85 }}>✓ Saved</span>
        )}
      </div>
      <p style={{ fontSize: '0.8rem', color: 'rgb(var(--cream-rgb) / 0.6)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
        Choose which emails you&rsquo;d like to receive. You can change these anytime.
      </p>

      {error && (
        <p style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '0.5rem' }}>{error}</p>
      )}

      {prefs === null && !error ? (
        <p style={{ fontSize: '0.85rem', opacity: 0.4, fontStyle: 'italic' }}>Loading…</p>
      ) : prefs ? (
        <div>
          {TOGGLES.map(t => (
            <PrefCheckbox
              key={t.key}
              label={t.label}
              description={t.description}
              checked={prefs[t.key]}
              disabled={saving === t.key}
              onChange={v => update(t.key, v)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

'use client'

import { useState } from 'react'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.6rem 0.85rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.5rem',
  color: 'var(--cream)',
  fontSize: '0.88rem',
  outline: 'none',
  boxSizing: 'border-box',
}

const DEPT_MAX = 40
const ROLE_MAX = 28

export function SuggestRoleModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    dept_name: '', dept_description: '', role_name: '', role_description: '', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit() {
    if (!form.dept_name.trim() || !form.role_name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/role-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setSaving(false); return }
      setDone(true)
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setSaving(false)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 60 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 61, background: 'var(--ink-deep)', border: '1px solid rgb(var(--gold-rgb) / 0.25)',
        borderRadius: '1rem', padding: '2rem', width: '90%', maxWidth: '480px',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>✦</p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--gold)', marginBottom: '0.5rem' }}>
              Suggestion submitted
            </p>
            <p style={{ fontSize: '0.85rem', opacity: 0.5, lineHeight: 1.7, marginBottom: '1.5rem' }}>
              The organising team will review your suggestion and you'll be notified when it's been decided on.
            </p>
            <button onClick={onClose} style={{ padding: '0.6rem 1.5rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.4)', background: 'transparent', color: 'var(--lemon)', cursor: 'pointer', fontSize: '0.82rem' }}>
              Close
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--gold)', marginBottom: '0.4rem' }}>
              Suggest a Role
            </p>
            <p style={{ fontSize: '0.78rem', opacity: 0.45, lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Don't see a role that fits? Suggest one for the organising team to review.
            </p>

            {/* Department */}
            <p style={{ fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.6, marginBottom: '0.75rem' }}>
              Department
            </p>

            <div style={{ marginBottom: '0.85rem' }}>
              <label style={{ fontSize: '0.78rem', opacity: 0.6, display: 'block', marginBottom: '0.35rem' }}>
                Department Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                style={inputStyle}
                value={form.dept_name}
                onChange={e => set('dept_name', e.target.value)}
                placeholder="e.g. Sound & Music"
                maxLength={DEPT_MAX}
              />
              <p style={{ fontSize: '0.68rem', margin: '0.25rem 0 0', opacity: form.dept_name.length > 32 ? 1 : 0.3, color: form.dept_name.length >= DEPT_MAX ? 'var(--danger)' : 'var(--gold)' }}>
                {form.dept_name.length}/{DEPT_MAX}
              </p>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.78rem', opacity: 0.6, display: 'block', marginBottom: '0.35rem' }}>
                What does this department do? <span style={{ opacity: 0.5 }}>(optional)</span>
              </label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: '64px' }}
                value={form.dept_description}
                onChange={e => set('dept_description', e.target.value)}
                placeholder="Brief description"
              />
            </div>

            {/* Role */}
            <p style={{ fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--purple)', opacity: 0.6, marginBottom: '0.75rem' }}>
              Role
            </p>

            <div style={{ marginBottom: '0.85rem' }}>
              <label style={{ fontSize: '0.78rem', opacity: 0.6, display: 'block', marginBottom: '0.35rem' }}>
                Role Name <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
              <input
                style={inputStyle}
                value={form.role_name}
                onChange={e => set('role_name', e.target.value)}
                placeholder="e.g. Stage Manager"
                maxLength={ROLE_MAX}
              />
              <p style={{ fontSize: '0.68rem', margin: '0.25rem 0 0', opacity: form.role_name.length > 22 ? 1 : 0.3, color: form.role_name.length >= ROLE_MAX ? 'var(--danger)' : 'var(--gold)' }}>
                {form.role_name.length}/{ROLE_MAX}
              </p>
            </div>

            <div style={{ marginBottom: '0.85rem' }}>
              <label style={{ fontSize: '0.78rem', opacity: 0.6, display: 'block', marginBottom: '0.35rem' }}>
                What would this role involve? <span style={{ opacity: 0.5 }}>(optional)</span>
              </label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: '64px' }}
                value={form.role_description}
                onChange={e => set('role_description', e.target.value)}
                placeholder="What would this person do?"
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: '0.78rem', opacity: 0.6, display: 'block', marginBottom: '0.35rem' }}>
                Anything else to add? <span style={{ opacity: 0.5 }}>(optional)</span>
              </label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: '64px' }}
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Why you think this role would be valuable, or any context"
              />
            </div>

            {error && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'transparent', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.82rem', opacity: 0.7 }}>
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !form.dept_name.trim() || !form.role_name.trim()}
                style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.45)', background: 'transparent', color: 'var(--lemon)', cursor: 'pointer', fontSize: '0.82rem', opacity: saving || !form.dept_name.trim() || !form.role_name.trim() ? 0.4 : 1 }}
              >
                {saving ? 'Submitting…' : 'Submit suggestion'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

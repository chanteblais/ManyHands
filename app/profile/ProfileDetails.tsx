'use client'

import { useEffect, useState } from 'react'
import { profileGaps, type ProfileField } from '@/lib/profile-fields'

const GOLD = 'var(--gold)'
const PURPLE = 'var(--purple)'
const CREAM = 'var(--cream)'
const INK = 'var(--ink)'

const fieldInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.4rem', color: CREAM, fontSize: '0.88rem',
  padding: '0.5rem 0.65rem', outline: 'none', fontFamily: 'inherit',
}

function displayValue(field: ProfileField, v: unknown): string {
  if (v == null || v === '') return '—'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  if (field.type === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

// One editable control per field type.
function FieldEditor({ field, value, onChange }: {
  field: ProfileField
  value: unknown
  onChange: (v: unknown) => void
}) {
  switch (field.type) {
    case 'textarea':
      return <textarea value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} rows={3} style={{ ...fieldInput, resize: 'vertical' }} />
    case 'number':
      return <input type="number" value={value == null ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} style={fieldInput} />
    case 'date':
      return <input type="date" value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} style={fieldInput} />
    case 'boolean':
      return (
        <button
          type="button"
          onClick={() => onChange(!value)}
          style={{ ...fieldInput, width: 'auto', cursor: 'pointer', color: value ? GOLD : 'rgb(var(--cream-rgb) / 0.6)' }}
        >
          {value ? 'Yes' : 'No'}
        </button>
      )
    case 'single_select':
      return (
        <select value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} style={fieldInput}>
          <option value="" style={{ background: INK }}>— select —</option>
          {(field.options ?? []).map(o => <option key={o} value={o} style={{ background: INK }}>{o}</option>)}
        </select>
      )
    case 'multi_select': {
      const vals = Array.isArray(value) ? (value as string[]) : []
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {(field.options ?? []).map(o => {
            const on = vals.includes(o)
            return (
              <button
                key={o}
                type="button"
                onClick={() => onChange(on ? vals.filter(x => x !== o) : [...vals, o])}
                style={{
                  padding: '0.3rem 0.8rem', borderRadius: '9999px', cursor: 'pointer',
                  fontSize: '0.8rem', fontFamily: 'inherit',
                  border: `1px solid ${on ? GOLD : 'rgb(var(--gold-rgb) / 0.25)'}`,
                  background: on ? 'rgb(var(--gold-rgb) / 0.15)' : 'transparent',
                  color: on ? GOLD : 'rgb(var(--cream-rgb) / 0.6)',
                }}
              >
                {o}
              </button>
            )
          })}
          {(field.options ?? []).length === 0 && (
            <span style={{ fontSize: '0.78rem', opacity: 0.4, fontStyle: 'italic' }}>No options configured.</span>
          )}
        </div>
      )
    }
    default:
      return <input value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} style={fieldInput} />
  }
}

export function ProfileDetails({ title = 'Profile Details', initialFields, initialValues }: {
  title?: string
  /** Server-rendered registry fields (already filtered to public/memberEditable) — skips the mount fetch. */
  initialFields?: ProfileField[]
  initialValues?: Record<string, unknown>
} = {}) {
  const [fields, setFields] = useState<ProfileField[] | null>(initialFields ?? null)
  const [values, setValues] = useState<Record<string, unknown>>(initialValues ?? {})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialFields != null) return // server already provided the data
    fetch('/api/profile/fields')
      .then(r => r.json())
      .then(d => { setFields(d.fields ?? []); setValues(d.values ?? {}) })
      .catch(() => setFields([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nothing to show until loaded; render nothing if the registry has no
  // member-visible/editable fields (keeps the profile clean).
  if (!fields || fields.length === 0) return null

  const editable = fields.filter(f => f.memberEditable)
  // Catch-up gaps (Phase 4.5): ask-existing fields with no value yet. Recomputed
  // from live `values`, so a gap's highlight clears the moment the member fills
  // it in. The summary prompt + dismissal now live in the top-of-page ProfileNudge
  // banner (app/profile/ProfileNudge.tsx); here a gap only styles its field so it's
  // easy to spot after "Add now" scrolls the member down.
  const gaps = profileGaps(fields, values)
  const gapKeys = new Set(gaps.map(g => g.key))

  function setValue(key: string, v: unknown) {
    setValues(prev => ({ ...prev, [key]: v }))
    setDirty(true); setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {}
      for (const f of editable) payload[f.key] = values[f.key] ?? (f.type === 'multi_select' ? [] : '')
      const res = await fetch('/api/profile/fields', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to save')
      } else {
        setError(null); setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 2500)
      }
    } catch { setError('Network error') }
    setSaving(false)
  }

  return (
    <div style={{ padding: '1.75rem 2rem', border: '1px solid rgb(var(--gold-rgb) / 0.18)', borderRadius: '1rem', background: 'rgb(var(--gold-rgb) / 0.03)' }}>
      <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: GOLD, margin: '0 0 0.35rem' }}>
        {title}
      </p>
      <p style={{ fontSize: '0.8rem', opacity: 0.45, margin: '0 0 1.5rem', lineHeight: 1.6 }}>
        Keep your details up to date. Editable fields can be changed any time.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        {fields.map(field => {
          const isGap = gapKeys.has(field.key)
          return (
            <div key={field.key} style={isGap ? { borderLeft: `2px solid rgb(var(--purple-rgb) / 0.5)`, paddingLeft: '0.85rem', marginLeft: '-0.85rem' } : undefined}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, opacity: 0.7 }}>
                  {field.label}
                </label>
                {isGap && (
                  <span style={{ fontSize: '0.56rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.12rem 0.5rem', borderRadius: '9999px', border: '1px solid rgb(var(--purple-rgb) / 0.4)', color: PURPLE }}>
                    {field.required ? 'Required' : 'Optional'}
                  </span>
                )}
              </div>
              {field.description && (
                <p style={{ fontSize: '0.74rem', opacity: 0.4, margin: '0 0 0.5rem', fontStyle: 'italic' }}>{field.description}</p>
              )}
              {field.memberEditable
                ? <FieldEditor field={field} value={values[field.key]} onChange={v => setValue(field.key, v)} />
                : <p style={{ fontSize: '0.9rem', color: CREAM, opacity: 0.85, margin: 0 }}>{displayValue(field, values[field.key])}</p>}
            </div>
          )
        })}
      </div>

      {editable.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
          <button
            onClick={save}
            disabled={!dirty || saving}
            style={{
              padding: '0.55rem 1.5rem', borderRadius: '9999px', border: 'none',
              cursor: (!dirty || saving) ? 'default' : 'pointer',
              background: (!dirty || saving) ? 'rgb(var(--gold-rgb) / 0.15)' : GOLD,
              color: (!dirty || saving) ? 'rgb(var(--cream-rgb) / 0.5)' : INK,
              fontSize: '0.8rem', letterSpacing: '0.06em', fontWeight: 600, transition: 'all 0.15s',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <span style={{ fontSize: '0.75rem' }}>
            {error ? <span style={{ color: 'var(--danger)' }}>{error}</span>
              : saving ? null
              : dirty ? <span style={{ color: PURPLE, opacity: 0.85 }}>Unsaved changes</span>
              : saved ? <span style={{ color: GOLD, opacity: 0.7 }}>Saved ✓</span>
              : null}
          </span>
        </div>
      )}
    </div>
  )
}

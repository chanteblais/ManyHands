'use client'

import { useState, useEffect } from 'react'
import { LoadError } from './LoadError'
import { useConfirm } from '../components/ConfirmDialog'

// A shift type is just a named, requirement-free KIND of shift (Setup, Service,
// Tea, …). Requirement-ness lives elsewhere: on a group/role (conditional) or an
// attunement task (universal). So this registry is deliberately minimal.
type ShiftType = { id: string; name: string; icon: string | null; sort_order: number }
type Form = { name: string; icon: string }

const GOLD = 'var(--gold)'

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.5rem', padding: '0.6rem 0.85rem', color: 'var(--cream)', fontSize: '0.875rem',
  fontFamily: 'var(--font-libre-baskerville), Georgia, serif', outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase',
  color: GOLD, opacity: 0.65, display: 'block', marginBottom: '0.35rem',
}

function ShiftTypeModal({
  initial, isNew, onSave, onClose, saving, error,
}: {
  initial: Form
  isNew: boolean
  onSave: (f: Form) => void
  onClose: () => void
  saving: boolean
  error: string | null
}) {
  const [form, setForm] = useState(initial)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 51, background: '#1a1410', border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '1rem', padding: '2rem', width: '90%', maxWidth: '440px' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: GOLD, marginBottom: '1.5rem' }}>
          {isNew ? 'New Shift Type' : 'Edit Shift Type'}
        </p>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Service" maxLength={40} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Emoji (optional)</label>
          <input style={inputStyle} value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder="e.g. 🍵" />
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'transparent', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.82rem', opacity: 0.7 }}>Cancel</button>
          <button onClick={() => onSave(form)} disabled={saving || !form.name.trim()} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.45)', background: 'transparent', color: 'var(--lemon)', cursor: 'pointer', fontSize: '0.82rem', opacity: saving || !form.name.trim() ? 0.4 : 1 }}>
            {saving ? 'Saving…' : 'Save type'}
          </button>
        </div>
      </div>
    </>
  )
}

const EMPTY: Form = { name: '', icon: '' }

export function ShiftTypesManager() {
  const [types, setTypes] = useState<ShiftType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState<ShiftType | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, confirmDialog } = useConfirm()

  const load = () => {
    setLoadError(false)
    fetch('/api/admin/shift-types')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setTypes(d.shiftTypes ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleCreate(form: Form) {
    setSaving(true); setError(null)
    const res = await fetch('/api/admin/shift-types', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, sort_order: types.length }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setTypes(prev => [...prev, data.shiftType])
    setCreating(false); setSaving(false)
  }

  async function handleUpdate(st: ShiftType, form: Form) {
    setSaving(true); setError(null)
    const res = await fetch(`/api/admin/shift-types/${st.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setTypes(prev => prev.map(t => t.id === st.id ? { ...t, ...data.shiftType } : t))
    setEditing(null); setSaving(false)
  }

  async function handleDelete(id: string) {
    const st = types.find(t => t.id === id)
    const ok = await confirm({
      title: `Delete ${st ? `“${st.name}”` : 'this shift type'}?`,
      body: 'Events and requirements referencing it will be cleared. This cannot be undone.',
      confirmLabel: 'Delete type',
      danger: true,
    })
    if (!ok) return
    const res = await fetch(`/api/admin/shift-types/${id}`, { method: 'DELETE' })
    if (res.ok) setTypes(prev => prev.filter(t => t.id !== id))
  }

  if (loading) return <p style={{ opacity: 0.4, fontSize: '0.85rem' }}>Loading…</p>
  if (loadError) return <LoadError onRetry={() => { setLoading(true); load() }} />

  const sorted = [...types].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div>
      <p style={{ fontSize: '0.8rem', opacity: 0.5, lineHeight: 1.6, marginBottom: '1.25rem' }}>
        The kinds of shift members can sign up for. A type on its own is just <em>available</em> — you make it
        <strong style={{ opacity: 0.85 }}> required</strong> by setting hours on a group/role (Configure → Groups) or as an
        attunement task (everyone).
      </p>

      {sorted.length === 0 ? (
        <p style={{ opacity: 0.4, fontSize: '0.85rem', fontStyle: 'italic', marginBottom: '1.25rem' }}>No shift types yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
          {sorted.map(st => (
            <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.9rem 1rem', borderRadius: '0.75rem', border: '1px solid rgb(var(--gold-rgb) / 0.18)', background: 'rgba(255,255,255,0.02)' }}>
              {st.icon && <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{st.icon}</span>}
              <p style={{ flex: 1, minWidth: 0, fontSize: '0.92rem', color: 'var(--cream)', margin: 0, fontWeight: 600 }}>{st.name}</p>
              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                <button onClick={() => { setEditing(st); setError(null) }} style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.4rem', color: GOLD, cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.7 }}>Edit</button>
                <button onClick={() => handleDelete(st.id)} style={{ background: 'none', border: '1px solid rgba(255,80,80,0.2)', borderRadius: '0.4rem', color: 'var(--danger)', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.7 }}>Del</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => { setCreating(true); setError(null) }}
        style={{ padding: '0.55rem 1.1rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.35)', background: 'transparent', color: GOLD, cursor: 'pointer', fontSize: '0.82rem', letterSpacing: '0.05em' }}
      >
        + New shift type
      </button>

      {creating && (
        <ShiftTypeModal initial={EMPTY} isNew saving={saving} error={error} onSave={handleCreate} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <ShiftTypeModal initial={{ name: editing.name, icon: editing.icon ?? '' }} isNew={false} saving={saving} error={error} onSave={(f) => handleUpdate(editing, f)} onClose={() => setEditing(null)} />
      )}

      {confirmDialog}
    </div>
  )
}

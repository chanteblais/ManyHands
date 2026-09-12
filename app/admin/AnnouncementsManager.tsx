'use client'

import { useState, useEffect } from 'react'
import { LoadError } from './LoadError'
import { useConfirm } from '../components/ConfirmDialog'

type Announcement = {
  id: string
  title: string
  body: string | null
  pinned: boolean
  visible: boolean
  expires_at: string | null
  created_at: string
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.5rem', padding: '0.6rem 0.85rem', color: 'var(--cream)', fontSize: '0.875rem',
  fontFamily: 'var(--font-libre-baskerville), Georgia, serif', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'var(--gold)', opacity: 0.65, display: 'block', marginBottom: '0.35rem',
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

function AnnouncementModal({
  initial,
  onSave,
  onClose,
  saving,
  error,
}: {
  initial: Omit<Announcement, 'id' | 'created_at'>
  onSave: (form: Omit<Announcement, 'id' | 'created_at'>) => void
  onClose: () => void
  saving: boolean
  error: string | null
}) {
  const [form, setForm] = useState(initial)
  const set = (k: keyof typeof form, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 'min(95vw, 520px)', maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--ink)', border: '1px solid rgb(var(--gold-rgb) / 0.25)',
        borderRadius: '1rem', padding: '1.5rem', zIndex: 50,
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--gold)', margin: 0 }}>
            {initial.title ? 'Edit announcement' : 'New announcement'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: '1.4rem', cursor: 'pointer', opacity: 0.7 }}>×</button>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Title</label>
          <input style={inputStyle} value={form.title} onChange={e => set('title', e.target.value)} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Body (optional)</label>
          <textarea
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            value={form.body ?? ''}
            onChange={e => set('body', e.target.value || null)}
            placeholder="Additional details…"
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Expires (optional — leave blank to show indefinitely)</label>
          <input
            style={{ ...inputStyle, width: '200px' }}
            type="date"
            value={form.expires_at ? form.expires_at.slice(0, 10) : ''}
            onChange={e => set('expires_at', e.target.value ? `${e.target.value}T23:59:59Z` : null)}
          />
        </div>

        <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem' }}>
          <Toggle checked={form.pinned} onChange={v => set('pinned', v)} label="Pinned" />
          <Toggle checked={form.visible} onChange={v => set('visible', v)} label="Visible" />
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'transparent', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.82rem', opacity: 0.7 }}>
            Cancel
          </button>
          <button onClick={() => onSave(form)} disabled={saving || !form.title} style={{ padding: '0.6rem 1.2rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.45)', background: 'transparent', color: 'var(--lemon)', cursor: 'pointer', fontSize: '0.82rem', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}

const blank = (): Omit<Announcement, 'id' | 'created_at'> => ({
  title: '', body: null, pinned: false, visible: true, expires_at: null,
})

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AnnouncementsManager() {
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [modal, setModal] = useState<{ mode: 'add' } | { mode: 'edit'; item: Announcement } | null>(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  // List-level failures (delete / visibility toggle) — the modal has its own error.
  const [actionError, setActionError] = useState<string | null>(null)
  const { confirm, confirmDialog } = useConfirm()

  const load = async () => {
    setLoadError(false)
    try {
      const res = await fetch('/api/admin/announcements/all')
      if (!res.ok) throw new Error()
      const json = await res.json()
      setItems(json.announcements)
    } catch {
      setLoadError(true)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleSave = async (form: Omit<Announcement, 'id' | 'created_at'>) => {
    setSaving(true)
    setModalError(null)
    try {
      let res: Response
      if (modal?.mode === 'edit') {
        res = await fetch(`/api/admin/announcements/${modal.item.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        })
      } else {
        res = await fetch('/api/admin/announcements', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
        })
      }
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      await load()
      setModal(null)
    } catch (e: unknown) {
      setModalError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const item = items.find(a => a.id === id)
    const ok = await confirm({
      title: `Delete ${item ? `“${item.title}”` : 'this announcement'}?`,
      confirmLabel: 'Delete announcement',
      danger: true,
    })
    if (!ok) return
    setActionError(null)
    const res = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {}
      setActionError(data.error ?? 'Something went wrong — the announcement was not deleted.')
      return
    }
    setItems(prev => prev.filter(a => a.id !== id))
  }

  const handleToggleVisible = async (item: Announcement) => {
    setActionError(null)
    const res = await fetch(`/api/admin/announcements/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: !item.visible }),
    }).catch(() => null)
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {}
      setActionError(data.error ?? 'Something went wrong — visibility was not changed.')
      return
    }
    setItems(prev => prev.map(a => a.id === item.id ? { ...a, visible: !a.visible } : a))
  }

  if (loading) return <p style={{ opacity: 0.4, fontStyle: 'italic', fontSize: '0.875rem' }}>Loading…</p>
  if (loadError) return <LoadError onRetry={() => { setLoading(true); load() }} />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <p style={{ fontSize: '0.68rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, margin: 0 }}>
          Announcements — {items.length}
        </p>
        <button
          onClick={() => { setModal({ mode: 'add' }); setModalError(null) }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.25)', background: 'transparent', color: 'var(--gold)', cursor: 'pointer', fontSize: '0.78rem', letterSpacing: '0.06em', opacity: 0.75 }}
        >
          + New announcement
        </button>
      </div>

      {actionError && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '0 0 0.6rem' }}>{actionError}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.length === 0 && <p style={{ opacity: 0.35, fontStyle: 'italic', fontSize: '0.82rem' }}>No announcements yet.</p>}
        {items.map(item => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.85rem 1rem', borderRadius: '0.65rem',
            border: '1px solid rgb(var(--gold-rgb) / 0.12)',
            background: item.visible ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.005)',
            opacity: item.visible ? 1 : 0.5,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {item.pinned && <span style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--purple)', border: '1px solid rgb(var(--purple-rgb) / 0.3)', borderRadius: '9999px', padding: '0.1rem 0.5rem' }}>Pinned</span>}
                <p style={{ fontSize: '0.9rem', color: 'var(--cream)', margin: 0, fontWeight: 600 }}>{item.title}</p>
              </div>
              {item.body && <p style={{ fontSize: '0.8rem', opacity: 0.55, margin: '0.2rem 0 0', lineHeight: 1.5 }}>{item.body}</p>}
              <p style={{ fontSize: '0.68rem', opacity: 0.35, margin: '0.35rem 0 0' }}>
                {formatDate(item.created_at)}{item.expires_at ? ` · expires ${formatDate(item.expires_at)}` : ''}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
              <button onClick={() => handleToggleVisible(item)} title={item.visible ? 'Visible to members — click to hide' : 'Hidden from members — click to show'} aria-label={item.visible ? 'Visible to members — click to hide' : 'Hidden from members — click to show'} style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.4rem', color: 'var(--gold)', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.6 }}>
                {item.visible ? '●' : '○'}
              </button>
              <button onClick={() => { setModal({ mode: 'edit', item }); setModalError(null) }} style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.4rem', color: 'var(--gold)', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.6 }}>
                Edit
              </button>
              <button onClick={() => handleDelete(item.id)} style={{ background: 'none', border: '1px solid rgba(255,100,100,0.2)', borderRadius: '0.4rem', color: 'var(--danger)', cursor: 'pointer', padding: '0.25rem 0.5rem', fontSize: '0.7rem', opacity: 0.5 }}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <AnnouncementModal
          initial={modal.mode === 'edit' ? modal.item : blank()}
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

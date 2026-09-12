'use client'

import { useState, useEffect } from 'react'
import { useConfirm } from './components/ConfirmDialog'

type Poll = {
  id: string
  question: string
  options: string[]
  visible: boolean
  allow_multiple: boolean
  expires_at: string | null
  created_at: string
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgb(var(--gold-rgb) / 0.2)',
  borderRadius: '0.5rem', padding: '0.6rem 0.85rem', color: 'var(--cream)', fontSize: '0.875rem',
  fontFamily: 'var(--font-libre-baskerville), Georgia, serif', outline: 'none', boxSizing: 'border-box',
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

type PollForm = {
  question: string
  options: string[]
  visible: boolean
  allow_multiple: boolean
  expires_at: string
}

const defaultForm = (): PollForm => ({
  question: '',
  options: ['', ''],
  visible: true,
  allow_multiple: false,
  expires_at: '',
})

function PollModal({
  initial,
  onSave,
  onClose,
  saving,
  error,
}: {
  initial: PollForm
  onSave: (form: PollForm) => void
  onClose: () => void
  saving: boolean
  error: string | null
}) {
  const [form, setForm] = useState<PollForm>(initial)

  function setOption(i: number, val: string) {
    const opts = [...form.options]
    opts[i] = val
    setForm(f => ({ ...f, options: opts }))
  }

  function addOption() {
    setForm(f => ({ ...f, options: [...f.options, ''] }))
  }

  function removeOption(i: number) {
    setForm(f => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }))
  }

  const valid = form.question.trim() && form.options.filter(o => o.trim()).length >= 2

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--ink)', border: '1px solid rgb(var(--gold-rgb) / 0.3)', borderRadius: '1rem',
        padding: '2rem', maxWidth: '540px', width: '100%', maxHeight: '90vh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: '1.2rem', margin: '0 0 1.5rem' }}>
          {initial.question ? 'Edit Poll' : 'New Poll'}
        </h2>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Question</label>
          <textarea
            value={form.question}
            onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
            placeholder="What would you like to ask?"
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Options</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {form.options.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  value={opt}
                  onChange={e => setOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  style={{ ...inputStyle, flex: 1 }}
                />
                {form.options.length > 2 && (
                  <button
                    onClick={() => removeOption(i)}
                    style={{ background: 'none', border: 'none', color: 'var(--danger-strong)', cursor: 'pointer', fontSize: '1rem', padding: '0.2rem 0.4rem', opacity: 0.7 }}
                  >×</button>
                )}
              </div>
            ))}
            {form.options.length < 10 && (
              <button
                onClick={addOption}
                style={{ background: 'none', border: '1px dashed rgb(var(--gold-rgb) / 0.25)', borderRadius: '0.5rem', color: 'var(--gold)', opacity: 0.6, cursor: 'pointer', padding: '0.45rem', fontSize: '0.78rem' }}
              >
                + Add option
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
          <Toggle checked={form.visible} onChange={v => setForm(f => ({ ...f, visible: v }))} label="Visible to members" />
          <Toggle checked={form.allow_multiple} onChange={v => setForm(f => ({ ...f, allow_multiple: v }))} label="Allow multiple selections" />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={labelStyle}>Expires at (optional)</label>
          <input
            type="datetime-local"
            value={form.expires_at}
            onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
            style={inputStyle}
          />
        </div>

        {error && <p style={{ fontSize: '0.8rem', color: 'var(--danger-strong)', marginBottom: '1rem' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.5rem', color: 'var(--cream)', padding: '0.55rem 1.25rem', cursor: 'pointer', fontSize: '0.85rem', opacity: 0.7 }}>
            Cancel
          </button>
          <button
            onClick={() => valid && onSave(form)}
            disabled={saving || !valid}
            style={{ background: valid ? 'rgb(var(--gold-rgb) / 0.15)' : 'rgb(var(--gold-rgb) / 0.05)', border: '1px solid rgb(var(--gold-rgb) / 0.35)', borderRadius: '0.5rem', color: 'var(--gold)', padding: '0.55rem 1.25rem', cursor: valid ? 'pointer' : 'not-allowed', fontSize: '0.85rem', opacity: saving ? 0.5 : 1 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function PollsManager() {
  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; poll?: Poll } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const { confirm, confirmDialog } = useConfirm()

  useEffect(() => {
    fetch('/api/admin/polls')
      .then(r => r.json())
      .then(d => setPolls(d.polls ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(form: PollForm) {
    setSaving(true)
    setSaveError(null)
    const options = form.options.filter(o => o.trim())
    const body = { ...form, options, expires_at: form.expires_at || null }

    const isEdit = modal?.mode === 'edit' && modal.poll
    const url = isEdit ? `/api/admin/polls/${modal.poll!.id}` : '/api/admin/polls'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json()
    setSaving(false)

    if (!res.ok) { setSaveError(json.error ?? 'Failed'); return }

    if (isEdit) {
      setPolls(prev => prev.map(p => p.id === json.poll.id ? json.poll : p))
    } else {
      setPolls(prev => [json.poll, ...prev])
    }
    setModal(null)
  }

  async function handleDelete(id: string) {
    const poll = polls.find(p => p.id === id)
    const ok = await confirm({
      title: `Delete ${poll ? `“${poll.question}”` : 'this poll'}?`,
      body: 'All its votes will be removed too.',
      confirmLabel: 'Delete poll',
      danger: true,
    })
    if (!ok) return
    setDeleting(id)
    await fetch(`/api/admin/polls/${id}`, { method: 'DELETE' })
    setPolls(prev => prev.filter(p => p.id !== id))
    setDeleting(null)
  }

  async function toggleVisible(poll: Poll) {
    const res = await fetch(`/api/admin/polls/${poll.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: !poll.visible }),
    })
    const json = await res.json()
    if (res.ok) setPolls(prev => prev.map(p => p.id === json.poll.id ? json.poll : p))
  }

  const modalInitial = modal?.mode === 'edit' && modal.poll
    ? {
        question: modal.poll.question,
        options: modal.poll.options,
        visible: modal.poll.visible,
        allow_multiple: modal.poll.allow_multiple,
        expires_at: modal.poll.expires_at ? modal.poll.expires_at.slice(0, 16) : '',
      }
    : defaultForm()

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button
          onClick={() => { setSaveError(null); setModal({ mode: 'create' }) }}
          style={{ background: 'rgb(var(--gold-rgb) / 0.1)', border: '1px solid rgb(var(--gold-rgb) / 0.3)', borderRadius: '0.5rem', color: 'var(--gold)', padding: '0.5rem 1.1rem', cursor: 'pointer', fontSize: '0.8rem', letterSpacing: '0.06em' }}
        >
          + New Poll
        </button>
      </div>

      {loading && <p style={{ opacity: 0.4, fontSize: '0.85rem', textAlign: 'center' }}>Loading…</p>}

      {!loading && polls.length === 0 && (
        <p style={{ opacity: 0.4, fontStyle: 'italic', fontSize: '0.85rem', textAlign: 'center' }}>No polls yet.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {polls.map(poll => (
          <div key={poll.id} style={{
            border: '1px solid rgb(var(--gold-rgb) / 0.18)', borderRadius: '0.75rem',
            background: 'rgba(255,255,255,0.02)', padding: '1rem 1.25rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.5rem' }}>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--parchment)', lineHeight: 1.45, flex: 1 }}>{poll.question}</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  onClick={() => toggleVisible(poll)}
                  title={poll.visible ? 'Hide from members' : 'Show to members'}
                  style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.4rem', color: poll.visible ? 'var(--gold)' : '#888', padding: '0.2rem 0.55rem', cursor: 'pointer', fontSize: '0.7rem' }}
                >
                  {poll.visible ? 'Visible' : 'Hidden'}
                </button>
                <button
                  onClick={() => { setSaveError(null); setModal({ mode: 'edit', poll }) }}
                  style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '0.4rem', color: 'var(--gold)', padding: '0.2rem 0.55rem', cursor: 'pointer', fontSize: '0.7rem' }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(poll.id)}
                  disabled={deleting === poll.id}
                  style={{ background: 'none', border: '1px solid rgba(255,80,80,0.25)', borderRadius: '0.4rem', color: 'var(--danger-strong)', padding: '0.2rem 0.55rem', cursor: 'pointer', fontSize: '0.7rem', opacity: deleting === poll.id ? 0.5 : 1 }}
                >
                  Delete
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {poll.options.map((opt, i) => (
                <span key={i} style={{ fontSize: '0.72rem', background: 'rgb(var(--gold-rgb) / 0.07)', border: '1px solid rgb(var(--gold-rgb) / 0.15)', borderRadius: '9999px', padding: '0.15rem 0.6rem', color: 'var(--gold)', opacity: 0.75 }}>
                  {opt}
                </span>
              ))}
            </div>

            {(poll.allow_multiple || poll.expires_at) && (
              <p style={{ fontSize: '0.68rem', opacity: 0.35, margin: '0.5rem 0 0' }}>
                {poll.allow_multiple && 'Multiple choice'}
                {poll.allow_multiple && poll.expires_at && ' · '}
                {poll.expires_at && `Expires ${new Date(poll.expires_at).toLocaleDateString()}`}
              </p>
            )}
          </div>
        ))}
      </div>

      {modal && (
        <PollModal
          initial={modalInitial}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
          error={saveError}
        />
      )}

      {confirmDialog}
    </div>
  )
}

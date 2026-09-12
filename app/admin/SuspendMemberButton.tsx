'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '../components/ConfirmDialog'

// Admin suspend/resume toggle for an approved member, keyed by application id.
// Suspending releases the member's groups + shifts (they keep site access);
// resuming just lifts the flag — nothing is restored automatically.
export function SuspendMemberButton({
  id,
  name,
  suspended,
}: {
  id: string
  name: string
  suspended: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirm()

  const submit = async (nextSuspended: boolean) => {
    setLoading(true)
    const res = await fetch(`/api/admin/${id}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspended: nextSuspended, note: note.trim() }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setLoading(false)
      setConfirming(false)
      await confirm({ title: `Could not update ${name}`, body: data?.error ?? 'Something went wrong — please try again.', notice: true })
      return
    }
    setLoading(false)
    setConfirming(false)
    setNote('')
    router.refresh()
  }

  // Resuming is low-stakes — a single confirm, no note.
  if (suspended) {
    return (
      <>
        <button
          onClick={() => submit(false)}
          disabled={loading}
          style={{
            padding: '0.4rem 1rem',
            borderRadius: '9999px',
            border: '1px solid rgb(var(--gold-rgb) / 0.4)',
            background: 'transparent',
            color: 'var(--gold)',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '...' : 'Resume attendance'}
        </button>
        {confirmDialog}
      </>
    )
  }

  if (!confirming) {
    return (
      <>
        <button
          onClick={() => setConfirming(true)}
          style={{
            padding: '0.4rem 1rem',
            borderRadius: '9999px',
            border: '1px solid rgba(255,180,80,0.35)',
            background: 'transparent',
            color: 'var(--warning)',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            cursor: 'pointer',
            opacity: 0.9,
          }}
        >
          Suspend attendance
        </button>
        {confirmDialog}
      </>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: '480px', padding: '1.25rem 1.5rem', border: '1px solid rgba(255,180,80,0.35)', borderRadius: '0.75rem', background: 'rgba(255,180,80,0.05)' }}>
      <p style={{ fontSize: '0.9rem', opacity: 0.85, marginBottom: '0.75rem', lineHeight: 1.6 }}>
        Suspend <strong>{name}</strong>? They'll be released from all their commitments — role, groups, shifts, and
        anything they're bringing — and can't take on new ones until resumed. They keep full access to the site, and
        won't be counted in the participation numbers. You can resume them anytime.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note (kept in the admin record)"
        rows={2}
        style={{
          width: '100%',
          padding: '0.6rem 0.75rem',
          borderRadius: '0.5rem',
          border: '1px solid rgb(var(--gold-rgb) / 0.2)',
          background: 'rgba(255,255,255,0.03)',
          color: 'var(--cream)',
          fontSize: '0.85rem',
          fontFamily: 'inherit',
          resize: 'vertical',
          marginBottom: '0.9rem',
        }}
      />
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={() => submit(true)}
          disabled={loading}
          style={{
            padding: '0.4rem 1.1rem',
            borderRadius: '9999px',
            border: '1px solid rgba(255,180,80,0.45)',
            background: 'rgba(255,180,80,0.12)',
            color: 'var(--warning)',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '...' : 'Confirm suspension'}
        </button>
        <button
          onClick={() => { setConfirming(false); setNote('') }}
          disabled={loading}
          style={{
            padding: '0.4rem 1.1rem',
            borderRadius: '9999px',
            border: '1px solid rgb(var(--gold-rgb) / 0.2)',
            background: 'transparent',
            color: 'var(--cream)',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: 0.6,
          }}
        >
          Cancel
        </button>
      </div>
      {confirmDialog}
    </div>
  )
}

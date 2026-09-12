'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '../components/ConfirmDialog'

export function RemoveMemberButton({ id, name, redirectAfter }: { id: string; name: string; redirectAfter?: string }) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirm()

  const handleRemove = async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/${id}/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setLoading(false)
      setConfirming(false)
      await confirm({ title: `Could not remove ${name}`, body: 'Something went wrong — please try again.', notice: true })
      return
    }
    if (data?.emailWarning) await confirm({ title: 'Removed, with a hiccup', body: data.emailWarning, notice: true })
    if (redirectAfter) router.push(redirectAfter)
    else router.refresh()
  }

  if (!confirming) {
    return (
      <>
        <button
          onClick={() => setConfirming(true)}
          style={{
            padding: '0.4rem 1rem',
            borderRadius: '9999px',
            border: '1px solid rgba(255,120,120,0.3)',
            background: 'transparent',
            color: 'var(--danger-soft)',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            cursor: 'pointer',
            opacity: 0.85,
          }}
        >
          Remove member
        </button>
        {confirmDialog}
      </>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: '480px', padding: '1.25rem 1.5rem', border: '1px solid rgba(255,120,120,0.3)', borderRadius: '0.75rem', background: 'rgba(255,0,0,0.04)' }}>
      <p style={{ fontSize: '0.9rem', opacity: 0.85, marginBottom: '0.75rem', lineHeight: 1.6 }}>
        Remove <strong>{name}</strong> from this gathering? Their role and shift will be released. This sets their
        application to cancelled — you can re-approve them later if needed.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Optional note to the member (included in their email)"
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
          onClick={handleRemove}
          disabled={loading}
          style={{
            padding: '0.4rem 1.1rem',
            borderRadius: '9999px',
            border: '1px solid rgba(255,120,120,0.45)',
            background: 'rgba(255,120,120,0.12)',
            color: 'var(--danger-soft)',
            fontSize: '0.75rem',
            letterSpacing: '0.08em',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? '...' : 'Confirm removal'}
        </button>
        <button
          onClick={() => { setConfirming(false); setReason('') }}
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

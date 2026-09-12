'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Claim action on a Registry entry — only rendered for approved members.
// POSTs the same /api/signup the picker uses, then refreshes the server page
// so counts and the "Your role" marker stay exact.
export function ClaimRoleButton({
  roleId, roleName, requiresApproval, isCurrent, isPendingApproval, isFull,
}: {
  roleId: string
  roleName: string
  requiresApproval: boolean
  isCurrent: boolean
  isPendingApproval: boolean
  isFull: boolean
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isCurrent) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
        fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase',
        color: isPendingApproval ? 'var(--purple)' : 'var(--success)',
        border: `1px solid ${isPendingApproval ? 'rgb(var(--purple-rgb) / 0.35)' : 'rgba(100,200,120,0.35)'}`,
        borderRadius: '9999px', padding: '0.35rem 0.9rem',
      }}>
        {isPendingApproval ? 'Requested — pending approval' : '✦ Your role'}
      </span>
    )
  }

  if (isFull) {
    return (
      <span style={{ fontSize: '0.72rem', color: 'var(--danger)', opacity: 0.7, letterSpacing: '0.06em' }}>
        Full
      </span>
    )
  }

  async function handleClaim() {
    if (saving) return
    setSaving(true); setError(null)
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Something went wrong')
      setSaving(false)
      return
    }
    setSaving(false)
    setConfirming(false)
    router.refresh()
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          style={{
            padding: '0.4rem 1.05rem', borderRadius: '9999px',
            border: '1px solid rgb(var(--gold-rgb) / 0.4)', background: 'rgb(var(--gold-rgb) / 0.07)',
            color: 'var(--gold)', cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.06em',
          }}
        >
          {requiresApproval ? 'Request this role' : 'Claim this role'}
        </button>
      ) : (
        <>
          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
            {requiresApproval
              ? `Request "${roleName}"? An organizer will review it.`
              : `Take up "${roleName}"?`}
          </span>
          <button
            onClick={handleClaim}
            disabled={saving}
            style={{
              padding: '0.35rem 1rem', borderRadius: '9999px',
              border: '1px solid rgb(var(--gold-rgb) / 0.55)', background: 'rgb(var(--gold-rgb) / 0.12)',
              color: 'var(--lemon)', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '0.75rem', letterSpacing: '0.06em', opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Confirm'}
          </button>
          <button
            onClick={() => { setConfirming(false); setError(null) }}
            style={{ background: 'none', border: 'none', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.72rem', opacity: 0.4, padding: 0 }}
          >
            Never mind
          </button>
        </>
      )}
      {error && <span style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>{error}</span>}
    </span>
  )
}

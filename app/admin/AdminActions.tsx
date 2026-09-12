'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '../components/ConfirmDialog'

export function AdminActions({ id, email, redirectAfter }: { id: string; email: string; redirectAfter?: string }) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirm()

  const handleApprove = async () => {
    setLoading('approve')
    const res = await fetch(`/api/admin/${id}/approve`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      await confirm({ title: 'Approval failed', body: data?.error ?? 'Something went wrong — the application is still pending.', notice: true })
      setLoading(null)
      return
    }
    if (data?.emailWarning) await confirm({ title: 'Approved, with a hiccup', body: data.emailWarning, notice: true })
    if (redirectAfter) router.push(redirectAfter)
    else router.refresh()
    setLoading(null)
  }

  const handleReject = async () => {
    // Rejecting emails the applicant — the heavier gesture of the two, so it
    // gets the same guard the volunteer Decline has (UX 2026-07-20 #28).
    const ok = await confirm({
      title: 'Reject this application?',
      body: `${email} will be emailed that their application wasn't accepted.`,
      confirmLabel: 'Reject',
      danger: true,
    })
    if (!ok) return
    setLoading('reject')
    const res = await fetch(`/api/admin/${id}/reject`, { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      await confirm({ title: 'Rejection failed', body: data?.error ?? 'Something went wrong — the application is still pending.', notice: true })
      setLoading(null)
      return
    }
    if (data?.emailWarning) await confirm({ title: 'Rejected, with a hiccup', body: data.emailWarning, notice: true })
    if (redirectAfter) router.push(redirectAfter)
    else router.refresh()
    setLoading(null)
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
      <button
        onClick={handleApprove}
        disabled={loading !== null}
        style={{
          padding: '0.4rem 1rem',
          borderRadius: '9999px',
          border: '1px solid rgb(var(--purple-rgb) / 0.4)',
          background: 'transparent',
          color: 'var(--purple)',
          fontSize: '0.75rem',
          letterSpacing: '0.08em',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading === 'approve' ? '...' : 'Approve'}
      </button>
      <button
        onClick={handleReject}
        disabled={loading !== null}
        style={{
          padding: '0.4rem 1rem',
          borderRadius: '9999px',
          border: '1px solid rgb(var(--gold-rgb) / 0.2)',
          background: 'transparent',
          color: 'var(--cream)',
          fontSize: '0.75rem',
          letterSpacing: '0.08em',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.5 : 0.4,
        }}
      >
        {loading === 'reject' ? '...' : 'Reject'}
      </button>
      {confirmDialog}
    </div>
  )
}

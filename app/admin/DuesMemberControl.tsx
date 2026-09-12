'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '../components/ConfirmDialog'

const GOLD = 'var(--gold)'
const PURPLE = 'var(--purple)'
const CREAM = 'var(--cream)'

// Per-member camp-dues control on /admin/[id]. Keyed by member id (matches the
// dues tracker). Mark paid captures an optional note (amount/method); undo clears
// it. The same state powers the 'Camp dues paid' attunement task.
export function DuesMemberControl({
  memberId,
  name,
  paidAt,
  reportedAt,
  note: initialNote,
}: {
  memberId: string
  name: string
  paidAt: string | null
  reportedAt: string | null
  note: string | null
}) {
  const [paid, setPaid] = useState(!!paidAt)
  const [paidDate, setPaidDate] = useState<string | null>(paidAt)
  // Self-reported (068) but not yet confirmed → an "awaiting review" state with
  // Confirm / Not received. Cleared once confirmed or reset.
  const [reported, setReported] = useState(!paidAt && !!reportedAt)
  const [note, setNote] = useState('')
  const [savedNote, setSavedNote] = useState(initialNote)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirm()

  const submit = async (nextPaid: boolean) => {
    setLoading(true)
    const res = await fetch(`/api/admin/dues/${memberId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: nextPaid, note: nextPaid ? note.trim() : '' }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setLoading(false)
      await confirm({ title: `Could not update ${name}`, body: data?.error ?? 'Something went wrong — please try again.', notice: true })
      return
    }
    const data = await res.json().catch(() => ({}))
    setPaid(nextPaid)
    setReported(false) // confirming or resetting both leave the awaiting state
    setPaidDate(nextPaid ? (data.dues_paid_at ?? new Date().toISOString()) : null)
    setSavedNote(nextPaid ? (note.trim() || null) : null)
    if (!nextPaid) setNote('')
    setLoading(false)
    router.refresh()
  }

  if (paid) {
    const dateLabel = paidDate
      ? new Date(paidDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
      : null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
        <p style={{ fontSize: '0.85rem', color: GOLD, margin: 0 }}>
          ✓ Dues paid{dateLabel ? ` · ${dateLabel}` : ''}
        </p>
        {savedNote && <p style={{ fontSize: '0.78rem', opacity: 0.55, margin: 0, fontStyle: 'italic' }}>{savedNote}</p>}
        <button
          onClick={() => submit(false)}
          disabled={loading}
          style={{ padding: '0.35rem 0.9rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.3)', background: 'transparent', color: CREAM, fontSize: '0.72rem', letterSpacing: '0.06em', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 0.7 }}
        >
          {loading ? '…' : 'Mark unpaid'}
        </button>
        {confirmDialog}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', width: '100%', maxWidth: '360px', margin: '0 auto' }}>
      {reported && (
        <p style={{ fontSize: '0.82rem', color: PURPLE, margin: 0, textAlign: 'center' }}>
          ⧗ This member reported paying — confirm when it lands.
        </p>
      )}
      <input
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional note — e.g. $50 e-transfer"
        style={{ width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.7rem', borderRadius: '0.5rem', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'rgba(255,255,255,0.03)', color: CREAM, fontSize: '0.82rem', fontFamily: 'inherit', outline: 'none' }}
      />
      <button
        onClick={() => submit(true)}
        disabled={loading}
        style={{ padding: '0.4rem 1.1rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.4)', background: 'rgb(var(--gold-rgb) / 0.12)', color: GOLD, fontSize: '0.75rem', letterSpacing: '0.08em', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}
      >
        {loading ? '…' : reported ? 'Confirm dues paid' : 'Mark dues paid'}
      </button>
      {reported && (
        <button
          onClick={() => submit(false)}
          disabled={loading}
          style={{ background: 'none', border: 'none', color: CREAM, opacity: loading ? 0.4 : 0.55, fontSize: '0.75rem', textDecoration: 'underline', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          Not received — clear their report
        </button>
      )}
      {confirmDialog}
    </div>
  )
}

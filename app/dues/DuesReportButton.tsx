'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const GOLD = 'var(--gold)'
const CREAM = 'var(--cream)'

// Member self-report control on /dues. When they haven't reported, a primary
// "I've sent my dues" button files the claim (dues_reported_at, 068). When they
// have (but an admin hasn't confirmed yet), a quiet "Undo" retracts it.
// router.refresh() re-renders the server page with the new state.
export function DuesReportButton({ reported }: { reported: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const submit = async (next: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dues/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reported: next }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Something went wrong — please try again.')
        setLoading(false)
        return
      }
      router.refresh()
      // Leave the spinner up until the refresh paints the new state.
    } catch {
      setError('Network error — please try again.')
      setLoading(false)
    }
  }

  if (reported) {
    return (
      <div>
        <button
          onClick={() => submit(false)}
          disabled={loading}
          style={{ background: 'none', border: 'none', padding: 0, color: CREAM, opacity: loading ? 0.4 : 0.55, fontSize: '0.78rem', textDecoration: 'underline', cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit' }}
        >
          {loading ? 'Updating…' : 'Undo — I haven’t paid yet'}
        </button>
        {error && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: '0.5rem 0 0' }}>{error}</p>}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => submit(true)}
        disabled={loading}
        style={{
          padding: '0.6rem 1.4rem', borderRadius: '9999px',
          border: `1px solid rgb(var(--gold-rgb) / 0.5)`, background: 'rgb(var(--gold-rgb) / 0.14)',
          color: GOLD, fontSize: '0.85rem', letterSpacing: '0.05em',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, fontFamily: 'inherit',
        }}
      >
        {loading ? 'Sending…' : "I’ve sent my dues"}
      </button>
      <p style={{ fontSize: '0.74rem', opacity: 0.45, margin: '0.5rem 0 0', lineHeight: 1.5 }}>
        Lets an organizer know to look for your payment — they’ll confirm it here.
      </p>
      {error && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', margin: '0.5rem 0 0' }}>{error}</p>}
    </div>
  )
}

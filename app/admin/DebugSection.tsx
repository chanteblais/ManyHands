'use client'

import { useState } from 'react'
import { useConfirm } from '../components/ConfirmDialog'

export function DebugSection() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ name: string; deleted: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { confirm, confirmDialog } = useConfirm()

  async function handleReset() {
    if (!email.trim()) return
    const ok = await confirm({
      title: `Reset all application data for ${email}?`,
      body: 'This cannot be undone.',
      confirmLabel: 'Reset user',
      danger: true,
    })
    if (!ok) return
    setLoading(true)
    setResult(null)
    setError(null)
    const res = await fetch('/api/admin/debug/reset-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (!res.ok) setError(data.error)
    else { setResult(data); setEmail('') }
    setLoading(false)
  }

  return (
    <div style={{ padding: '1rem', border: '1px solid rgba(255,80,80,0.2)', borderRadius: '0.75rem', background: 'rgba(255,0,0,0.03)' }}>
      <p style={{ fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--danger)', opacity: 0.7, marginBottom: '0.75rem' }}>
        ⚠ Debug only — removes all application data for a user
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleReset()}
          placeholder="user@email.com"
          style={{ flex: 1, padding: '0.55rem 0.85rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,80,80,0.2)', borderRadius: '0.5rem', color: 'var(--cream)', fontSize: '0.88rem', outline: 'none' }}
        />
        <button
          onClick={handleReset}
          disabled={loading || !email.trim()}
          style={{ padding: '0.55rem 1.25rem', borderRadius: '9999px', border: '1px solid rgba(255,80,80,0.4)', background: 'transparent', color: 'var(--danger)', cursor: loading || !email.trim() ? 'not-allowed' : 'pointer', fontSize: '0.82rem', opacity: loading || !email.trim() ? 0.4 : 1, whiteSpace: 'nowrap' }}
        >
          {loading ? 'Resetting…' : 'Reset user'}
        </button>
      </div>
      {error && <p style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '0.6rem' }}>{error}</p>}
      {result && (
        <p style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: '0.6rem' }}>
          ✓ Reset <strong>{result.name}</strong> — deleted: {result.deleted.join(', ')}
        </p>
      )}
      {confirmDialog}
    </div>
  )
}

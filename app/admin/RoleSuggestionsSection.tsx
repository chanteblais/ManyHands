'use client'

import { useState, useEffect } from 'react'
import { LoadError } from './LoadError'

type Suggestion = {
  id: string
  applicant_name: string | null
  dept_name: string
  dept_description: string | null
  role_name: string
  role_description: string | null
  notes: string | null
  created_at: string
}

export function RoleSuggestionsSection() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  const load = () => {
    setLoadError(false)
    fetch('/api/admin/role-suggestions')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setSuggestions(d.suggestions ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function handleDecision(id: string, decision: 'approved' | 'rejected') {
    setDeciding(id)
    const res = await fetch(`/api/admin/role-suggestions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    if (res.ok) setSuggestions(prev => prev.filter(s => s.id !== id))
    setDeciding(null)
  }

  if (loading) return <p style={{ opacity: 0.4, fontSize: '0.85rem' }}>Loading…</p>
  if (loadError) return <LoadError onRetry={() => { setLoading(true); load() }} />

  if (suggestions.length === 0) {
    return <p style={{ opacity: 0.4, fontSize: '0.85rem', fontStyle: 'italic' }}>No pending suggestions.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {suggestions.map(s => (
        <div key={s.id} style={{
          border: '1px solid rgb(var(--gold-rgb) / 0.18)',
          borderRadius: '0.75rem',
          background: 'rgb(var(--gold-rgb) / 0.02)',
          overflow: 'hidden',
        }}>
          {/* Summary row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '1rem 1.25rem' }}>
            {/* Who */}
            <div style={{ minWidth: '120px' }}>
              <p style={{ fontSize: '0.75rem', opacity: 0.45, margin: '0 0 0.1rem', letterSpacing: '0.04em' }}>from</p>
              <p style={{ fontSize: '0.9rem', color: 'var(--cream)', margin: 0 }}>{s.applicant_name ?? 'Member'}</p>
            </div>

            {/* What */}
            <div style={{ flex: 1, minWidth: '160px' }}>
              <p style={{ fontSize: '0.68rem', color: 'var(--gold)', opacity: 0.55, margin: '0 0 0.15rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {s.dept_name}
              </p>
              <p style={{ fontSize: '0.92rem', color: 'var(--purple)', margin: 0 }}>{s.role_name}</p>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
              {(s.dept_description || s.role_description || s.notes) && (
                <button
                  onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--gold)', opacity: 0.5, padding: '0.4rem 0.6rem' }}
                >
                  {expanded === s.id ? 'less ▲' : 'more ▼'}
                </button>
              )}
              <button
                onClick={() => handleDecision(s.id, 'approved')}
                disabled={deciding === s.id}
                style={{ padding: '0.4rem 1rem', borderRadius: '9999px', border: '1px solid rgba(100,200,120,0.4)', background: 'rgba(100,200,120,0.08)', color: 'var(--success)', cursor: 'pointer', fontSize: '0.8rem', opacity: deciding === s.id ? 0.5 : 1 }}
              >
                Add role
              </button>
              <button
                onClick={() => handleDecision(s.id, 'rejected')}
                disabled={deciding === s.id}
                style={{ padding: '0.4rem 1rem', borderRadius: '9999px', border: '1px solid rgba(255,80,80,0.25)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem', opacity: deciding === s.id ? 0.5 : 1 }}
              >
                Decline
              </button>
            </div>
          </div>

          {/* Expanded details */}
          {expanded === s.id && (
            <div style={{ padding: '0 1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid rgb(var(--gold-rgb) / 0.1)' }}>
              {s.dept_description && (
                <div style={{ paddingTop: '0.75rem' }}>
                  <p style={{ fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.5, margin: '0 0 0.2rem' }}>Dept description</p>
                  <p style={{ fontSize: '0.85rem', opacity: 0.65, margin: 0, lineHeight: 1.6 }}>{s.dept_description}</p>
                </div>
              )}
              {s.role_description && (
                <div style={{ paddingTop: s.dept_description ? '0' : '0.75rem' }}>
                  <p style={{ fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--purple)', opacity: 0.5, margin: '0 0 0.2rem' }}>Role description</p>
                  <p style={{ fontSize: '0.85rem', opacity: 0.65, margin: 0, lineHeight: 1.6 }}>{s.role_description}</p>
                </div>
              )}
              {s.notes && (
                <div>
                  <p style={{ fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cream)', opacity: 0.4, margin: '0 0 0.2rem' }}>Notes</p>
                  <p style={{ fontSize: '0.85rem', opacity: 0.55, margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>"{s.notes}"</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

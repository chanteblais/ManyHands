'use client'

import { useState } from 'react'
import { IconImage } from '@/components/IconImage'

const GOLD = 'var(--gold)'
const CREAM = 'var(--cream)'

export type AwardRule = { id: string; label: string; glyph?: string; image?: string; manualOnly: boolean }

// Admin grant/revoke of distinctions for a single member. Manual grants union
// with whatever the member already earns automatically (shown on their profile),
// so this lists every distinction with a toggle; "manual only" ones are earned
// solely from here.
export function DistinctionAwards({ memberId, rules, initialAwards }: {
  memberId: string | null
  rules: AwardRule[]
  initialAwards: string[]
}) {
  const [awards, setAwards] = useState<Set<string>>(new Set(initialAwards))
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!memberId) {
    return (
      <p style={{ fontSize: '0.8rem', opacity: 0.5, fontStyle: 'italic', margin: 0 }}>
        This applicant has no linked member record yet — manual distinctions become available once
        they&rsquo;ve signed in.
      </p>
    )
  }

  async function toggle(id: string) {
    const granted = awards.has(id)
    setBusy(id); setError(null)
    try {
      const res = await fetch(
        `/api/admin/members/${memberId}/distinctions${granted ? `?distinctionId=${encodeURIComponent(id)}` : ''}`,
        granted
          ? { method: 'DELETE' }
          : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ distinctionId: id }) },
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to update')
      } else {
        setAwards(prev => {
          const next = new Set(prev)
          if (granted) next.delete(id); else next.add(id)
          return next
        })
      }
    } catch { setError('Network error') }
    setBusy(null)
  }

  return (
    <div>
      <p style={{ fontSize: '0.78rem', opacity: 0.5, lineHeight: 1.6, margin: '0 0 1rem' }}>
        Grant a distinction by hand. Manual grants <em>add to</em> whatever this member already earns
        automatically from their facts.
      </p>

      {rules.length === 0 && (
        <p style={{ fontSize: '0.8rem', opacity: 0.4, fontStyle: 'italic' }}>No distinctions defined yet.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {rules.map(rule => {
          const on = awards.has(rule.id)
          return (
            <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.5rem 0.7rem', borderRadius: '0.5rem', border: '1px solid rgb(var(--gold-rgb) / 0.12)', background: on ? 'rgb(var(--gold-rgb) / 0.06)' : 'transparent' }}>
              <span style={{ width: 22, textAlign: 'center', flexShrink: 0 }}>
                {rule.image
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <IconImage src={rule.image} size={20} fill={0.9} />
                  : <span style={{ fontSize: '1rem' }}>{rule.glyph || '✦'}</span>}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: '0.85rem', color: CREAM }}>
                {rule.label}
                {rule.manualOnly && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.4 }}>manual only</span>
                )}
              </span>
              <button
                onClick={() => toggle(rule.id)}
                disabled={busy === rule.id}
                style={{
                  flexShrink: 0, padding: '0.25rem 0.85rem', borderRadius: '9999px',
                  fontSize: '0.72rem', letterSpacing: '0.05em', cursor: busy === rule.id ? 'wait' : 'pointer',
                  border: `1px solid ${on ? 'rgb(var(--danger-rgb) / 0.4)' : 'rgb(var(--gold-rgb) / 0.4)'}`,
                  background: on ? 'rgb(var(--danger-rgb) / 0.08)' : 'transparent',
                  color: on ? 'var(--danger)' : GOLD,
                }}
              >
                {busy === rule.id ? '…' : on ? 'Revoke' : 'Grant'}
              </button>
            </div>
          )
        })}
      </div>

      {error && <p style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.6rem' }}>{error}</p>}
    </div>
  )
}

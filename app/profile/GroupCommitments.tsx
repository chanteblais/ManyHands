'use client'

import { useState, useEffect } from 'react'
import { IconImage } from '@/components/IconImage'
import { useRouter } from 'next/navigation'

type OptInGroup = {
  id: string
  name: string
  description: string | null
  icon: string | null
  icon_image: string | null
  collection_id: string | null
  collection_name: string | null
  joined: boolean
  // The shift commitment this group carries (null = none). Surfaced on the row
  // so members see what they're taking on before they join.
  shift_commitment: { hours: number; type: string } | null
}

const GOLD = 'var(--gold)'

// Server-rendered pages pass the same shape /api/groups/membership returns
// (lib/participate-data.ts → getSelfJoinGroups), so the section renders with
// its data already in place and skips the fetch-after-hydration round-trip.
export function GroupCommitments({ initialGroups }: { initialGroups?: OptInGroup[] }) {
  const router = useRouter()
  const [groups, setGroups] = useState<OptInGroup[] | null>(initialGroups ?? null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialGroups) return
    fetch('/api/groups/membership')
      .then(r => r.json())
      .then(d => setGroups(d.groups ?? []))
      .catch(() => setGroups([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggle(g: OptInGroup) {
    const next = !g.joined
    setBusyId(g.id)
    setError(null)
    // Optimistic
    setGroups(prev => prev?.map(x => x.id === g.id ? { ...x, joined: next } : x) ?? prev)

    const res = await fetch('/api/groups/membership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: g.id, joined: next }),
    })

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Could not update. Try again.')
      // Revert
      setGroups(prev => prev?.map(x => x.id === g.id ? { ...x, joined: g.joined } : x) ?? prev)
    } else {
      // Refresh server components (profile badges, commitments card) on next nav.
      router.refresh()
    }
    setBusyId(null)
  }

  if (groups === null) {
    return <p style={{ fontSize: '0.85rem', opacity: 0.4 }}>Loading…</p>
  }
  if (groups.length === 0) {
    return (
      <p style={{ fontSize: '0.85rem', opacity: 0.45, fontStyle: 'italic' }}>
        No opt-in groups are available right now.
      </p>
    )
  }

  // Group the flat list under its collection, preserving the server order
  // (collections by sort_order, groups by sort_order within each).
  const sections: { id: string; name: string | null; groups: OptInGroup[] }[] = []
  for (const g of groups) {
    const key = g.collection_id ?? '__none__'
    let section = sections.find(s => s.id === key)
    if (!section) {
      section = { id: key, name: g.collection_name, groups: [] }
      sections.push(section)
    }
    section.groups.push(g)
  }

  const renderGroup = (g: OptInGroup) => {
    const busy = busyId === g.id
    return (
      <button
        key={g.id}
        onClick={() => toggle(g)}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', gap: '1rem', textAlign: 'left', width: '100%',
          padding: '1rem 1.25rem', borderRadius: '0.85rem', cursor: busy ? 'wait' : 'pointer',
          border: `1px solid ${g.joined ? 'rgb(var(--purple-rgb) / 0.45)' : 'rgb(var(--gold-rgb) / 0.18)'}`,
          background: g.joined ? 'rgb(var(--purple-rgb) / 0.08)' : 'rgba(255,255,255,0.02)',
          transition: 'border-color 0.15s, background 0.15s', opacity: busy ? 0.6 : 1,
        }}
      >
        {/* Icon */}
        <div style={{ width: 48, height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {g.icon_image
            ? /* eslint-disable-next-line @next/next/no-img-element */ <IconImage src={g.icon_image} size="100%" fill={0.85} />
            : <span style={{ fontSize: '1.5rem' }}>{g.icon || '✦'}</span>}
        </div>

        {/* Name + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--cream)', fontWeight: 600 }}>{g.name}</p>
          {g.description && (
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', opacity: 0.5, lineHeight: 1.5 }}>{g.description}</p>
          )}
          {g.shift_commitment && (
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: GOLD, opacity: 0.75, letterSpacing: '0.04em' }}>
              ✦ carries a {g.shift_commitment.hours}h {g.shift_commitment.type} shift commitment
            </p>
          )}
        </div>

        {/* Toggle pill */}
        <span style={{
          flexShrink: 0, fontSize: '0.7rem', letterSpacing: '0.08em', padding: '0.35rem 0.85rem',
          borderRadius: '9999px', whiteSpace: 'nowrap',
          border: `1px solid ${g.joined ? 'rgb(var(--purple-rgb) / 0.5)' : 'rgb(var(--gold-rgb) / 0.3)'}`,
          color: g.joined ? 'var(--purple)' : GOLD,
          background: g.joined ? 'rgb(var(--purple-rgb) / 0.12)' : 'transparent',
        }}>
          {g.joined ? '✓ Joined' : '+ Join'}
        </span>
      </button>
    )
  }

  return (
    <div>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {sections.map(section => (
          <div key={section.id}>
            {section.name && (
              <p style={{
                margin: '0 0 0.85rem', fontSize: '1.15rem', letterSpacing: '0.05em',
                color: GOLD, opacity: 0.9, fontFamily: 'var(--font-display)',
              }}>
                {section.name}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {section.groups.map(renderGroup)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

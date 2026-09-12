'use client'

import { useState } from 'react'

type Member = {
  clerk_user_id: string
  first_name: string
  last_name: string
  preferred_name: string | null
  email: string
  isAdmin: boolean
}

export function AdminsManager({ members }: { members: Member[] }) {
  const [list, setList] = useState(members)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  async function toggle(member: Member) {
    setLoading(member.clerk_user_id)
    setError(null)
    try {
      const res = await fetch('/api/admin/set-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: member.clerk_user_id, grant: !member.isAdmin }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setList(prev => prev.map(m =>
        m.clerk_user_id === member.clerk_user_id ? { ...m, isAdmin: !m.isAdmin } : m
      ))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(null)
    }
  }

  const admins = list.filter(m => m.isAdmin)
  const grantable = list.filter(m => {
    if (m.isAdmin) return false
    if (!search) return true
    const q = search.toLowerCase()
    const name = `${m.preferred_name ?? m.first_name} ${m.last_name}`.toLowerCase()
    return name.includes(q) || m.email.toLowerCase().includes(q)
  })
  // Untouched, the list shows a taste of who's grantable; search opens it up.
  // (A capped list beats an inner scrollbox, which trapped the page scroll.)
  const shown = search ? grantable : grantable.slice(0, 5)
  const remaining = grantable.length - shown.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {error && (
        <p style={{ fontSize: '0.8rem', color: 'var(--danger-strong)', padding: '0.5rem 1rem', background: 'rgba(255,0,0,0.05)', borderRadius: '0.5rem', border: '1px solid rgba(255,80,80,0.3)' }}>
          {error}
        </p>
      )}

      {admins.length > 0 && (
        <div>
          <p style={{ fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '0.75rem' }}>
            Current Admins
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {admins.map(m => (
              <AdminRow key={m.clerk_user_id} member={m} loading={loading === m.clerk_user_id} onToggle={toggle} />
            ))}
          </div>
        </div>
      )}

      <div>
        <p style={{ fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '0.75rem', opacity: 0.6 }}>
          Grant Admin Access
        </p>
        <input
          type="text"
          placeholder="Search members…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '0.6rem 0.9rem',
            borderRadius: '0.5rem',
            border: '1px solid rgb(var(--gold-rgb) / 0.25)',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--cream)',
            fontSize: '0.85rem',
            marginBottom: '0.75rem',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {grantable.length === 0 && (
            <p style={{ fontSize: '0.8rem', opacity: 0.4, fontStyle: 'italic', padding: '0.5rem 0' }}>
              {search ? 'No members match.' : 'All members are already admins.'}
            </p>
          )}
          {shown.map(m => (
            <AdminRow key={m.clerk_user_id} member={m} loading={loading === m.clerk_user_id} onToggle={toggle} />
          ))}
          {remaining > 0 && (
            <p style={{ fontSize: '0.78rem', opacity: 0.4, fontStyle: 'italic', padding: '0.25rem 0 0', margin: 0 }}>
              …and {remaining} more — search to find someone specific.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function AdminRow({ member, loading, onToggle }: {
  member: Member
  loading: boolean
  onToggle: (m: Member) => void
}) {
  const displayName = `${member.preferred_name ?? member.first_name} ${member.last_name}`
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.6rem 1rem',
      borderRadius: '0.5rem',
      border: `1px solid ${member.isAdmin ? 'rgb(var(--purple-rgb) / 0.25)' : 'rgb(var(--gold-rgb) / 0.15)'}`,
      background: member.isAdmin ? 'rgb(var(--purple-rgb) / 0.05)' : 'rgba(255,255,255,0.02)',
    }}>
      <div>
        <span style={{ fontSize: '0.88rem', color: 'var(--cream)' }}>{displayName}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--cream)', opacity: 0.4, marginLeft: '0.6rem' }}>{member.email}</span>
      </div>
      <button
        onClick={() => onToggle(member)}
        disabled={loading}
        style={{
          padding: '0.3rem 0.85rem',
          borderRadius: '0.4rem',
          border: `1px solid ${member.isAdmin ? 'rgba(255,100,100,0.4)' : 'rgb(var(--purple-rgb) / 0.4)'}`,
          background: 'transparent',
          color: member.isAdmin ? '#ff9999' : 'var(--purple)',
          fontSize: '0.75rem',
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.5 : 1,
          letterSpacing: '0.05em',
        }}
      >
        {loading ? '…' : member.isAdmin ? 'Remove Admin' : 'Make Admin'}
      </button>
    </div>
  )
}

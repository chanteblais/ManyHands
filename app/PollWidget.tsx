'use client'

import { useState } from 'react'
import { PollsManager } from './PollsManager'

type Poll = {
  id: string
  question: string
  options: string[]
  allow_multiple: boolean
  expires_at: string | null
  initialCounts: number[]
  initialUserVotes: number[]
}

function PollItem({ poll }: { poll: Poll }) {
  const [counts, setCounts] = useState(poll.initialCounts)
  const [userVotes, setUserVotes] = useState<number[]>(poll.initialUserVotes)
  const [pending, setPending] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const total = counts.reduce((a, b) => a + b, 0)

  async function vote(idx: number) {
    if (pending.length > 0) return
    let next: number[]
    if (poll.allow_multiple) {
      next = userVotes.includes(idx) ? userVotes.filter(v => v !== idx) : [...userVotes, idx]
    } else {
      next = [idx]
    }
    setPending(next)
    setError(null)
    try {
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_indexes: next }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed'); return }
      setCounts(json.counts)
      setUserVotes(json.userVotes)
    } catch {
      setError('Something went wrong')
    } finally {
      setPending([])
    }
  }

  const expired = poll.expires_at ? new Date(poll.expires_at) < new Date() : false

  return (
    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.08)' }}>
      <p style={{ fontSize: '0.88rem', color: 'var(--parchment)', margin: '0 0 0.85rem', lineHeight: 1.5 }}>
        {poll.question}
        {poll.allow_multiple && (
          <span style={{ fontSize: '0.65rem', color: 'var(--lavender)', opacity: 0.7, marginLeft: '0.5rem' }}>
            (select all that apply)
          </span>
        )}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {poll.options.map((opt, i) => {
          const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0
          const isVoted = userVotes.includes(i)
          const isPending = pending.includes(i)

          return (
            <button
              key={i}
              onClick={() => !expired && vote(i)}
              disabled={expired || pending.length > 0}
              style={{
                position: 'relative',
                width: '100%',
                textAlign: 'left',
                background: isVoted ? 'rgb(var(--gold-rgb) / 0.12)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isVoted ? 'rgb(var(--gold-rgb) / 0.45)' : 'rgb(var(--gold-rgb) / 0.15)'}`,
                borderRadius: '0.5rem',
                padding: '0.5rem 0.85rem',
                cursor: expired ? 'default' : 'pointer',
                overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}
            >
              {/* progress bar fill — results are visible to everyone, voted or not */}
              <span style={{
                position: 'absolute', inset: 0, right: `${100 - pct}%`,
                background: isVoted ? 'rgb(var(--gold-rgb) / 0.08)' : 'rgba(255,255,255,0.025)',
                transition: 'right 0.4s ease',
                pointerEvents: 'none',
              }} />
              <span style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.83rem', color: isVoted ? 'var(--gold)' : 'var(--cream)', opacity: isPending ? 0.6 : 1 }}>
                  {isVoted && '✓ '}{opt}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--gold)', opacity: 0.6, flexShrink: 0 }}>
                  {pct}% · {counts[i]}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.6rem' }}>
        {error && <p style={{ fontSize: '0.7rem', color: 'var(--danger-strong)', margin: 0 }}>{error}</p>}
        <p style={{ fontSize: '0.68rem', opacity: 0.3, margin: 0, marginLeft: 'auto' }}>
          {total} {total === 1 ? 'vote' : 'votes'}{expired ? ' · closed' : ''}
        </p>
      </div>
    </div>
  )
}

export function PollWidget({ polls, canManage = false }: { polls: Poll[]; canManage?: boolean }) {
  const [managing, setManaging] = useState(false)

  // Members with no active polls and no management rights see nothing; poll
  // managers always get the widget so they have somewhere to create the first one.
  if (polls.length === 0 && !canManage) return null

  return (
    <div style={{
      border: '1px solid rgb(var(--gold-rgb) / 0.25)',
      borderRadius: '1rem',
      background: 'rgba(10,0,20,0.5)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      <div style={{ padding: '1rem 1.5rem 0.75rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <p style={{ fontSize: '0.62rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, margin: 0 }}>
          Polls
        </p>
        {canManage && (
          <button
            onClick={() => setManaging(true)}
            style={{ background: 'none', border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '0.4rem', color: 'var(--gold)', padding: '0.2rem 0.7rem', cursor: 'pointer', fontSize: '0.68rem', letterSpacing: '0.08em' }}
          >
            Manage
          </button>
        )}
      </div>
      <div>
        {polls.length === 0 ? (
          <p style={{ fontSize: '0.82rem', opacity: 0.4, fontStyle: 'italic', textAlign: 'center', padding: '1.5rem' }}>
            No active polls. Use Manage to create one.
          </p>
        ) : (
          polls.map((poll, i) => (
            <div key={poll.id} style={{ borderBottom: i < polls.length - 1 ? '1px solid rgb(var(--gold-rgb) / 0.08)' : 'none' }}>
              <PollItem poll={poll} />
            </div>
          ))
        )}
      </div>

      {managing && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 900, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3rem 1.5rem', overflowY: 'auto' }}
          onClick={() => setManaging(false)}
        >
          <div
            style={{ background: 'var(--ink)', border: '1px solid rgb(var(--gold-rgb) / 0.3)', borderRadius: '1rem', padding: '1.75rem', maxWidth: '620px', width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: '1.2rem', margin: 0 }}>Manage Polls</h2>
              <button
                onClick={() => setManaging(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: 'var(--cream)', opacity: 0.5, cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: '0 0.25rem' }}
              >×</button>
            </div>
            <PollsManager />
          </div>
        </div>
      )}
    </div>
  )
}

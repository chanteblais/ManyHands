'use client'

import { useState } from 'react'
import { supabaseResizedUrl } from '@/lib/supabase-image'

export type Shoutout = {
  id: string
  clerk_user_id: string
  author_name: string
  body: string
  created_at: string
  avatar_url: string | null
}

const MAX_LEN = 250

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function Avatar({ url }: { url: string | null }) {
  return (
    <div style={{ flexShrink: 0, width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(111,73,31,0.6)', background: 'rgb(var(--gold-rgb) / 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={supabaseResizedUrl(url, 64) ?? ''} loading="lazy" decoding="async" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: '0.7rem', opacity: 0.3 }}>✦</span>}
    </div>
  )
}

export function ShoutoutWidget({
  initialShoutouts,
  currentUserId,
  currentUserAvatar,
  isApproved,
  isAdmin,
}: {
  initialShoutouts: Shoutout[]
  currentUserId: string | null
  currentUserAvatar: string | null
  isApproved: boolean
  isAdmin: boolean
}) {
  const [shoutouts, setShoutouts] = useState<Shoutout[]>(initialShoutouts)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function post() {
    const text = draft.trim()
    if (!text || posting) return
    setPosting(true)
    setError(null)
    try {
      const res = await fetch('/api/shoutouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to post'); return }
      setShoutouts(prev => [json.shoutout as Shoutout, ...prev])
      setDraft('')
      setComposing(false)
    } catch {
      setError('Something went wrong')
    } finally {
      setPosting(false)
    }
  }

  async function remove(id: string) {
    if (deleting) return
    setDeleting(id)
    setError(null)
    try {
      const res = await fetch(`/api/shoutouts/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? 'Failed to delete')
        return
      }
      setShoutouts(prev => prev.filter(s => s.id !== id))
    } catch {
      setError('Something went wrong')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div style={{ border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '1rem', background: 'rgba(10,0,20,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ padding: '1rem 1.5rem 0.75rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.12)' }}>
        <p style={{ fontSize: '0.62rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, margin: 0 }}>Shoutouts</p>
      </div>

      {/* Posts */}
      <div style={{ flex: 1 }}>
        {shoutouts.length === 0 ? (
          <p style={{ fontSize: '0.85rem', opacity: 0.4, fontStyle: 'italic', textAlign: 'center', padding: '1.5rem' }}>
            No shoutouts yet. Be the first to post one.
          </p>
        ) : shoutouts.map((s, i) => {
          const canDelete = isAdmin || s.clerk_user_id === currentUserId
          return (
            <div key={s.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.9rem 1.5rem', borderBottom: i < shoutouts.length - 1 ? '1px solid rgb(var(--gold-rgb) / 0.08)' : 'none' }}>
              <Avatar url={s.avatar_url} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--gold)', opacity: 0.9 }}>{s.author_name}</span>
                  <span style={{ fontSize: '0.68rem', opacity: 0.3 }}>{timeAgo(s.created_at)}</span>
                  {canDelete && (
                    <button
                      onClick={() => remove(s.id)}
                      disabled={deleting === s.id}
                      aria-label="Delete shoutout"
                      title="Delete"
                      style={{
                        marginLeft: 'auto', flexShrink: 0, background: 'none', border: 'none',
                        color: 'var(--gold)', opacity: deleting === s.id ? 0.3 : 0.4, cursor: 'pointer',
                        fontSize: '0.85rem', lineHeight: 1, padding: '0.1rem 0.25rem',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--parchment)', margin: '0.25rem 0 0', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {s.body}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer: post a shoutout (approved members only) */}
      {isApproved && (
        <div style={{ borderTop: '1px solid rgb(var(--gold-rgb) / 0.12)' }}>
          {composing ? (
            <div style={{ padding: '1rem 1.5rem', display: 'flex', gap: '0.75rem' }}>
              <Avatar url={currentUserAvatar} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value.slice(0, MAX_LEN))}
                  placeholder="Share a shoutout with the camp…"
                  rows={2}
                  autoFocus
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgb(var(--gold-rgb) / 0.18)',
                    borderRadius: '0.5rem', padding: '0.5rem 0.75rem', color: 'var(--cream)',
                    fontSize: '0.85rem', lineHeight: 1.5, fontFamily: 'inherit',
                  }}
                />
                {error && <p style={{ fontSize: '0.72rem', color: 'var(--danger-strong)', margin: '0.4rem 0 0' }}>{error}</p>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.68rem', opacity: 0.3 }}>{draft.length}/{MAX_LEN}</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => { setComposing(false); setDraft(''); setError(null) }}
                      disabled={posting}
                      style={{
                        padding: '0.4rem 1rem', borderRadius: '9999px',
                        border: '1px solid rgb(var(--cream-rgb) / 0.15)', background: 'transparent',
                        color: 'var(--cream)', opacity: 0.6, fontSize: '0.75rem', letterSpacing: '0.1em',
                        fontFamily: 'var(--font-display)', cursor: posting ? 'default' : 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={post}
                      disabled={posting || !draft.trim()}
                      style={{
                        padding: '0.4rem 1.1rem', borderRadius: '9999px',
                        border: '1px solid rgb(var(--gold-rgb) / 0.5)',
                        background: draft.trim() ? 'rgb(var(--gold-rgb) / 0.12)' : 'rgb(var(--gold-rgb) / 0.04)',
                        color: 'var(--gold)', fontSize: '0.75rem', letterSpacing: '0.1em',
                        fontFamily: 'var(--font-display)',
                        cursor: posting || !draft.trim() ? 'default' : 'pointer',
                        opacity: posting || !draft.trim() ? 0.5 : 1,
                      }}
                    >
                      {posting ? 'Posting…' : 'Post'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setComposing(true)}
              style={{
                width: '100%', padding: '0.85rem 1.5rem', background: 'none', border: 'none',
                color: 'var(--gold)', opacity: 0.75, cursor: 'pointer', textAlign: 'center',
                fontSize: '0.78rem', letterSpacing: '0.1em', fontFamily: 'var(--font-display)',
              }}
            >
              ✦ Share a shoutout
            </button>
          )}
        </div>
      )}
    </div>
  )
}

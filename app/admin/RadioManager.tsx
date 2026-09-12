'use client'

// Admin → Program → Radio: compose organizer broadcasts, curate the feed,
// and toggle the automatic sources (docs/radio.md). Broadcasts are
// announcements, not conversations — one box, no threads.

import { useEffect, useState } from 'react'
import { DEFAULT_RADIO_SOURCES, type RadioSources } from '@/lib/radio'

export type AdminRadioEvent = {
  id: string
  kind: string
  message: string
  icon: string | null
  actor_name: string | null
  created_at: string
}

const KIND_LABEL: Record<string, string> = {
  broadcast: 'Broadcast',
  welcome: 'Welcome',
  contribution: 'Contribution',
  achievement: 'Achievement',
  milestone: 'Milestone',
  voice: 'Member voice',
}

const SOURCE_ROWS: { key: keyof RadioSources; label: string; example: string }[] = [
  { key: 'welcome', label: 'Welcomes', example: '👋 Welcome Sarah to Glåüm!' },
  { key: 'contribution', label: 'Contributions', example: '✨ Sarah just covered a camping stove.' },
  { key: 'achievement', label: 'Achievements', example: '🏅 Erik earned the Setup distinction.' },
  { key: 'milestone', label: 'Milestones', example: '🎉 Shared Kitchen is now fully equipped.' },
  { key: 'voice', label: 'Member voices', example: '✦ Members posting from the /radio composer.' },
]

const inputStyle: React.CSSProperties = {
  background: 'rgb(var(--ink-rgb) / 0.6)',
  border: '1px solid rgb(var(--gold-rgb) / 0.25)',
  borderRadius: '0.5rem',
  color: 'var(--cream)',
  padding: '0.6rem 0.75rem',
  fontSize: '0.85rem',
  fontFamily: 'inherit',
}

export function RadioManager({ initialEvents, initialSources }: {
  initialEvents?: AdminRadioEvent[]
  initialSources?: RadioSources
}) {
  const [events, setEvents] = useState<AdminRadioEvent[] | null>(initialEvents ?? null)
  const [loadError, setLoadError] = useState(false)
  const [message, setMessage] = useState('')
  const [detail, setDetail] = useState('')
  const [icon, setIcon] = useState('')
  const [notify, setNotify] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postStatus, setPostStatus] = useState<string | null>(null)
  const [sources, setSources] = useState<RadioSources>(initialSources ?? { ...DEFAULT_RADIO_SOURCES })
  const [savingSource, setSavingSource] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

  // Mount fetch only when the server didn't pre-render the section.
  useEffect(() => {
    if (events !== null) return
    let cancelled = false
    fetch('/api/admin/radio')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (!cancelled) setEvents(d.events ?? []) })
      .catch(() => { if (!cancelled) setLoadError(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function post() {
    if (!message.trim() || posting) return
    setPosting(true)
    setPostStatus(null)
    try {
      const res = await fetch('/api/admin/radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          detail: detail.trim() || undefined,
          icon: icon.trim() || undefined,
          notify,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPostStatus(d.error ?? 'Failed to post')
      } else {
        setEvents(prev => [{
          id: d.id,
          kind: 'broadcast',
          message: message.trim(),
          icon: icon.trim() || '📢',
          actor_name: null,
          created_at: new Date().toISOString(),
        }, ...(prev ?? [])])
        setMessage('')
        setDetail('')
        setIcon('')
        setNotify(false)
        setPostStatus(notify ? `On the air — ${d.notified} members alerted, ${d.emailed} emailed.` : 'On the air.')
      }
    } catch {
      setPostStatus('Network error')
    }
    setPosting(false)
  }

  async function remove(id: string) {
    if (confirmingDelete !== id) {
      setConfirmingDelete(id)
      return
    }
    setConfirmingDelete(null)
    const prev = events
    setEvents(e => (e ?? []).filter(x => x.id !== id))
    const res = await fetch(`/api/admin/radio/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) setEvents(prev)
  }

  async function toggleSource(key: keyof RadioSources) {
    const next = { ...sources, [key]: !sources[key] }
    setSavingSource(key)
    try {
      const res = await fetch('/api/admin/page-content', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_radio: JSON.stringify({ sources: next }) }),
      })
      if (res.ok) setSources(next)
    } catch {}
    setSavingSource(null)
  }

  return (
    <div>
      <p style={{ fontSize: '0.82rem', opacity: 0.5, margin: '0 0 1.25rem', lineHeight: 1.6 }}>
        Radio is the community's curated feed — members tune in at <span style={{ color: 'var(--gold)' }}>/radio</span>.
        Post announcements here; the platform adds moments (welcomes, contributions, achievements,
        milestones) as camp life happens, and members can put their own on the air.
      </p>

      {/* Composer */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.75rem' }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={280}
          rows={2}
          placeholder="Opening Ceremony begins in 30 minutes… (**bold** reads as a gold highlight)"
          style={{ ...inputStyle, resize: 'vertical', minHeight: '3.2rem' }}
        />
        <input
          value={detail}
          onChange={e => setDetail(e.target.value)}
          maxLength={280}
          placeholder="Optional supporting line — e.g. Bring something warm."
          style={inputStyle}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            value={icon}
            onChange={e => setIcon(e.target.value)}
            maxLength={4}
            placeholder="📢"
            aria-label="Broadcast emoji"
            style={{ ...inputStyle, width: '3.4rem', textAlign: 'center' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', opacity: 0.7, cursor: 'pointer' }}>
            <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
            Also alert members (bell + email)
          </label>
          <button
            onClick={post}
            disabled={posting || !message.trim()}
            style={{
              marginLeft: 'auto',
              padding: '0.5rem 1.3rem',
              borderRadius: '9999px',
              border: '1px solid rgb(var(--gold-rgb) / 0.4)',
              background: 'rgb(var(--gold-rgb) / 0.12)',
              color: 'var(--gold)',
              fontSize: '0.78rem',
              letterSpacing: '0.08em',
              cursor: posting || !message.trim() ? 'default' : 'pointer',
              opacity: posting || !message.trim() ? 0.5 : 1,
            }}
          >
            {posting ? 'Broadcasting…' : 'Broadcast'}
          </button>
        </div>
        {postStatus && (
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--gold)', opacity: 0.8 }}>{postStatus}</p>
        )}
      </div>

      {/* Automatic sources */}
      <div style={{ margin: '1.5rem 0', padding: '1rem 1.1rem', borderRadius: '0.75rem', border: '1px solid rgb(var(--gold-rgb) / 0.12)' }}>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7 }}>
          Automatic broadcasts
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {SOURCE_ROWS.map(row => (
            <label key={row.key} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={sources[row.key]}
                disabled={savingSource === row.key}
                onChange={() => toggleSource(row.key)}
              />
              <span style={{ fontSize: '0.82rem', opacity: 0.85 }}>{row.label}</span>
              <span style={{ fontSize: '0.72rem', opacity: 0.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.example}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Recent events */}
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.7 }}>
        Recently on the air
      </p>
      {loadError ? (
        <p style={{ fontSize: '0.8rem', opacity: 0.5 }}>Couldn't load the feed — reload to retry.</p>
      ) : events === null ? (
        <p style={{ fontSize: '0.8rem', opacity: 0.4 }}>Loading…</p>
      ) : events.length === 0 ? (
        <p style={{ fontSize: '0.8rem', opacity: 0.4 }}>Nothing broadcast yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {events.map(e => (
            <div
              key={e.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.5rem 0.7rem',
                borderRadius: '0.5rem',
                border: '1px solid rgb(var(--gold-rgb) / 0.1)',
                background: 'rgb(var(--cream-rgb) / 0.02)',
              }}
            >
              <span style={{ fontSize: '0.68rem', color: 'var(--gold)', opacity: 0.65, flexShrink: 0, width: '5.2rem', letterSpacing: '0.04em' }}>
                {KIND_LABEL[e.kind] ?? e.kind}
              </span>
              <span style={{ fontSize: '0.8rem', opacity: 0.8, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.message}
              </span>
              <span style={{ fontSize: '0.66rem', opacity: 0.35, flexShrink: 0 }}>
                {new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <button
                onClick={() => remove(e.id)}
                onBlur={() => setConfirmingDelete(c => (c === e.id ? null : c))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: confirmingDelete === e.id ? 'var(--danger-strong)' : 'var(--cream)',
                  opacity: confirmingDelete === e.id ? 0.9 : 0.35,
                  fontSize: '0.68rem',
                  cursor: 'pointer',
                  flexShrink: 0,
                  padding: '0.2rem 0.3rem',
                }}
              >
                {confirmingDelete === e.id ? 'Sure?' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

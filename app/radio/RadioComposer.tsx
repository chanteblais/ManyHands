'use client'

// The on-page Radio composer. Anyone approved can pick up the mic (Chanté
// 2026-07-08: Radio is an open airwave now, not an organizer-only megaphone) —
// posts go out as 'voice' through /api/radio, right-aligned and signed. Two
// extras beyond a plain line, both reached through the @ autocomplete:
//   • @mention a member — mentioning them rings their bell + email.
//   • @here — notify EVERYONE (bell + email to all members); the post is
//     marked 📢. High-stakes, so posting an @here line asks for a confirm.
// (Replaced the earlier "Notify everyone" checkbox — Chanté 2026-07-08.)

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { RadioMember } from './RadioFeed'

const INPUT_ID = 'radio-composer-input'
const HERE_ID = '__here__'

// @here reaches everyone — a whole-token match, matched here in the UI and
// again server-side (so a typed @here counts even without the autocomplete).
const HERE_RE = /(?:^|\s)@here(?![\w])/i

// Find an in-progress @mention immediately before the caret, e.g. "hi @ja|".
function detectMention(text: string, caret: number): { query: string; at: number } | null {
  const upto = text.slice(0, caret)
  const m = /(?:^|\s)@([^\s@]*)$/.exec(upto)
  if (!m) return null
  return { query: m[1], at: caret - m[1].length - 1 }
}

type MentionOption = RadioMember & { here?: boolean }

export function RadioComposer({ members = [], currentUserId = null }: {
  members?: RadioMember[]
  currentUserId?: string | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // @mention autocomplete state.
  const [mention, setMention] = useState<{ query: string; at: number } | null>(null)
  const [mentionHighlight, setMentionHighlight] = useState(0)
  const [caretTarget, setCaretTarget] = useState<number | null>(null)

  const willNotifyAll = HERE_RE.test(message)

  // Autocomplete list: the @here megaphone (when "here" still matches what's
  // typed) sits on top, then matching members.
  const mentionMatches: MentionOption[] = (() => {
    if (!mention) return []
    const q = mention.query.toLowerCase()
    const here: MentionOption[] = 'here'.startsWith(q) ? [{ userId: HERE_ID, displayName: 'here', here: true }] : []
    const people = members
      .filter(m => m.userId !== currentUserId && m.displayName.toLowerCase().includes(q))
      .slice(0, 6)
    return [...here, ...people]
  })()

  // Shorter placeholder on narrow screens — the input gets ~190px next to the
  // mic and the On Air button. Set after mount (JS breakpoint, the house
  // pattern) so SSR and hydration agree.
  const [placeholder, setPlaceholder] = useState('Share with camp… (@ to mention, @here for all)')
  useEffect(() => {
    const pick = () => setPlaceholder(window.innerWidth < 700 ? 'Share with camp…' : 'Share with camp… (@ to mention, @here for all)')
    pick()
    window.addEventListener('resize', pick)
    return () => window.removeEventListener('resize', pick)
  }, [])

  // Restore the caret after a mention insertion shifts the text.
  useEffect(() => {
    if (caretTarget != null && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.setSelectionRange(caretTarget, caretTarget)
      setCaretTarget(null)
    }
  }, [caretTarget])

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setMessage(value)
    setConfirming(false)
    setMention(detectMention(value, e.target.selectionStart ?? value.length))
    setMentionHighlight(0)
  }

  function selectMention(m: MentionOption) {
    if (!mention) return
    const caret = mention.at + 1 + mention.query.length
    const before = message.slice(0, mention.at)
    const after = message.slice(caret)
    const insert = `@${m.displayName} `
    const next = before + insert + after
    setMessage(next)
    setMention(null)
    setCaretTarget(before.length + insert.length)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // While the @mention dropdown is open, keys drive it.
    if (mention && mentionMatches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionHighlight(h => (h + 1) % mentionMatches.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionHighlight(h => (h - 1 + mentionMatches.length) % mentionMatches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(mentionMatches[mentionHighlight]); return }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
    }
    if (e.key === 'Enter') { e.preventDefault(); attempt() }
  }

  // Enter / "On Air" click. An @here post rings the whole camp, so the first
  // attempt only arms the confirm — the second (Send to all) actually posts.
  function attempt() {
    if (!message.trim() || posting) return
    if (willNotifyAll && !confirming) { setConfirming(true); return }
    post()
  }

  async function post() {
    if (!message.trim() || posting) return
    setPosting(true)
    setError(null)
    setConfirming(false)
    try {
      const res = await fetch('/api/radio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Failed to post')
      } else {
        setMessage('')
        router.refresh()
      }
    } catch {
      setError('Network error')
    }
    setPosting(false)
  }

  return (
    <div className="radio-composer" style={{ marginBottom: '2.5rem', position: 'relative' }}>
      <div
        className="radio-composer-box"
        style={{
          position: 'relative',
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
          padding: '0.65rem 0.65rem 0.65rem 1.1rem',
          borderRadius: '0.9rem',
          border: '1px solid rgb(var(--gold-rgb) / 0.18)',
          background: 'rgb(var(--cream-rgb) / 0.03)',
        }}
      >
        <span aria-hidden style={{ color: 'var(--gold)', opacity: 0.7, fontSize: '1.05rem' }}>🎙</span>
        <input
          id={INPUT_ID}
          ref={inputRef}
          value={message}
          onChange={onChange}
          onKeyDown={onKeyDown}
          maxLength={280}
          placeholder={placeholder}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            color: 'var(--cream)',
            fontSize: '0.92rem',
            fontStyle: 'italic',
            fontFamily: 'inherit',
            outline: 'none',
            textOverflow: 'ellipsis',
          }}
        />
        <button
          className="radio-composer-btn"
          onClick={attempt}
          disabled={posting || !message.trim()}
          style={{
            flexShrink: 0,
            padding: '0.55rem 1.25rem',
            borderRadius: '0.6rem',
            border: '1px solid rgb(var(--gold-rgb) / 0.45)',
            background: 'rgb(var(--gold-rgb) / 0.16)',
            color: 'var(--gold)',
            fontSize: '0.75rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            cursor: posting || !message.trim() ? 'default' : 'pointer',
            opacity: posting || !message.trim() ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {posting ? 'On air…' : willNotifyAll ? '📢 On Air' : 'On Air ✦'}
        </button>

        {/* @mention / @here autocomplete */}
        {mention && mentionMatches.length > 0 && (
          <div
            role="listbox"
            aria-label="Mention a member or notify everyone"
            style={{
              position: 'absolute',
              top: 'calc(100% + 0.3rem)',
              left: 0,
              zIndex: 20,
              minWidth: '240px',
              maxHeight: '15rem',
              overflowY: 'auto',
              borderRadius: '0.6rem',
              border: '1px solid rgb(var(--gold-rgb) / 0.3)',
              background: '#241033',
              boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
              padding: '0.3rem',
            }}
          >
            {mentionMatches.map((m, i) => (
              <button
                key={m.userId}
                role="option"
                aria-selected={i === mentionHighlight}
                onMouseDown={e => { e.preventDefault(); selectMention(m) }}
                onMouseEnter={() => setMentionHighlight(i)}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '0.5rem',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.45rem 0.6rem',
                  borderRadius: '0.4rem',
                  border: 'none',
                  background: i === mentionHighlight ? 'rgb(var(--purple-rgb) / 0.18)' : 'transparent',
                  color: m.here ? '#F2D88A' : 'var(--cream)',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <span>{m.here ? '📢 @here' : `@${m.displayName}`}</span>
                {m.here && <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>Notify everyone</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {confirming && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
            margin: '0.6rem 0 0 1.1rem',
            padding: '0.6rem 0.8rem',
            borderRadius: '0.6rem',
            border: '1px solid rgb(var(--purple-rgb) / 0.4)',
            background: 'rgb(var(--purple-rgb) / 0.08)',
          }}
        >
          <span style={{ fontSize: '0.78rem', color: 'var(--cream)', opacity: 0.9 }}>
            📢 <strong>@here</strong> alerts <strong>every member</strong> by bell and email. Send anyway?
          </span>
          <button
            onClick={post}
            disabled={posting}
            style={{
              padding: '0.4rem 0.9rem', borderRadius: '0.5rem', border: '1px solid rgb(var(--purple-rgb) / 0.5)',
              background: 'rgb(var(--purple-rgb) / 0.2)', color: '#F8DBFF', fontSize: '0.72rem',
              letterSpacing: '0.06em', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {posting ? 'Sending…' : 'Send to all'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            style={{
              padding: '0.4rem 0.75rem', borderRadius: '0.5rem', border: 'none',
              background: 'transparent', color: 'var(--cream)', opacity: 0.6, fontSize: '0.72rem',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p style={{ margin: '0.4rem 0 0 1.1rem', fontSize: '0.72rem', color: 'var(--danger-strong)', opacity: 0.85 }}>{error}</p>
      )}
    </div>
  )
}

// The bottom-of-feed call to broadcast — scrolls back up to the composer.
export function GoLiveBar() {
  return (
    <button
      className="radio-golive"
      onClick={() => {
        const input = document.getElementById(INPUT_ID) as HTMLInputElement | null
        input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setTimeout(() => input?.focus({ preventScroll: true }), 450)
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        width: '100%',
        marginTop: '2rem',
        padding: '1rem 1.4rem',
        borderRadius: '0.9rem',
        border: '1px solid rgb(var(--gold-rgb) / 0.25)',
        background: 'rgb(var(--purple-rgb) / 0.05)',
        color: 'var(--gold)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      <span aria-hidden style={{ fontSize: '0.95rem', opacity: 0.85 }}>((•))</span>
      <span style={{ fontSize: '0.78rem', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Go Live</span>
      <span className="radio-golive-desc" style={{ fontSize: '0.85rem', color: 'var(--cream)', opacity: 0.55 }}>Share something with everyone.</span>
      <span aria-hidden style={{ marginLeft: 'auto', opacity: 0.6 }}>→</span>
    </button>
  )
}

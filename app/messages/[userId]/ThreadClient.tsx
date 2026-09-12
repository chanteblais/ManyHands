'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabaseResizedUrl } from '@/lib/supabase-image'

type Message = {
  id: string
  sender_clerk_id: string
  recipient_clerk_id: string
  body: string
  read: boolean
  read_at: string | null
  created_at: string
}

type Props = {
  currentUserId: string
  recipientId: string
  displayName: string
  avatarUrl: string | null
  pronouns: string | null
  recipientActive?: boolean
  // Server-rendered thread (when provided) — paints immediately; the mount
  // fetch below re-syncs and handles marking incoming messages read.
  initialMessages?: Message[]
}

const MAX_CHARS = 2000

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
  const isThisYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', ...(isThisYear ? {} : { year: 'numeric' }), hour: 'numeric', minute: '2-digit' })
}

export function ThreadClient({ currentUserId, recipientId, displayName, avatarUrl, pronouns, recipientActive = true, initialMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? [])
  const [loading, setLoading] = useState(initialMessages == null)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const initials = displayName.charAt(0).toUpperCase()

  // Index of the last message I sent — used to anchor the read receipt.
  const lastSentIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_clerk_id === currentUserId) return i
    }
    return -1
  })()

  // Tell the server that messages from the recipient have been viewed/read.
  const markRead = useCallback(async () => {
    try {
      await fetch(`/api/messages/${recipientId}/read`, { method: 'POST' })
    } catch {
      // Non-fatal — read receipts are best-effort.
    }
  }, [recipientId])

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/${recipientId}`, { cache: 'no-store' })
      const data = await res.json()
      const fetched: Message[] = data.messages ?? []
      setMessages(fetched)
      setLoading(false)

      // If any incoming messages are unread, mark them read on the server.
      const hasUnread = fetched.some(
        m => m.recipient_clerk_id === currentUserId && !m.read,
      )
      if (hasUnread) await markRead()
    } catch {
      setLoading(false)
    }
  }, [recipientId, currentUserId, markRead])

  useEffect(() => {
    fetchMessages()
    // Skip polls while the tab is hidden; catch up the moment it's visible again.
    const interval = setInterval(() => { if (!document.hidden) fetchMessages() }, 12000)
    const onVisible = () => { if (!document.hidden) fetchMessages() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [fetchMessages])

  // Scroll to bottom when messages load or new ones arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Size the composer to its content, up to the 160px cap — an effect rather
  // than onInput so programmatic changes (the post-send clear) resize too.
  // scrollHeight excludes the border that the border-box height includes; add
  // it back or the box sits 2px short and grows a permanent scrollbar.
  useEffect(() => {
    const t = textareaRef.current
    if (!t) return
    t.style.height = 'auto'
    const full = t.scrollHeight + t.offsetHeight - t.clientHeight
    t.style.height = Math.min(full, 160) + 'px'
    t.style.overflowY = full > 160 ? 'auto' : 'hidden'
  }, [body])

  const handleSend = async () => {
    const trimmed = body.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId, body: trimmed }),
    })

    if (res.ok) {
      setBody('')
      await fetchMessages()
    } else {
      const d = await res.json()
      setError(d.error ?? 'Failed to send')
    }
    setSending(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const charsLeft = MAX_CHARS - body.length
  const isOver = charsLeft < 0

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '720px', width: '100%', margin: '0 auto', position: 'relative', zIndex: 1 }}>

      {/* Thread header */}
      <div className="glass-bar" style={{
        padding: '5.5rem 1.5rem 1.25rem',
        borderBottom: '1px solid rgb(var(--gold-rgb) / 0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem',
        position: 'sticky',
        top: 0,
        ['--glass-bg' as string]: 'rgb(var(--ink-rgb) / 0.92)',
        zIndex: 10,
      }}>
        <a href="/messages" aria-label="Back to all messages" style={{ color: 'var(--gold)', opacity: 0.5, textDecoration: 'none', fontSize: '0.8rem', letterSpacing: '0.08em', flexShrink: 0 }}>
          <span aria-hidden="true">←</span>
        </a>
        {(() => {
          const inner = (
            <>
              <div style={{
                width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                border: '1px solid rgba(111,73,31,0.7)',
                background: 'rgb(var(--gold-rgb) / 0.08)',
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={supabaseResizedUrl(avatarUrl, 76) ?? avatarUrl} loading="lazy" decoding="async" alt={`${displayName}'s avatar`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span aria-hidden="true" style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--gold)', opacity: 0.6 }}>{initials}</span>
                )}
              </div>
              <div>
                <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--gold)' }}>{displayName}</p>
                {recipientActive
                  ? pronouns && <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.4 }}>{pronouns}</p>
                  : <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.4, fontStyle: 'italic' }}>No longer active</p>}
              </div>
            </>
          )
          // No profile to link to once the member is gone.
          return recipientActive ? (
            <a
              href={`/members/${recipientId}`}
              aria-label={`View ${displayName}'s profile`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: 'inherit' }}
            >
              {inner}
            </a>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>{inner}</div>
          )
        })()}
      </div>

      {/* Messages */}
      <div role="log" aria-label={`Conversation with ${displayName}`} aria-live="polite" aria-relevant="additions" style={{ flex: 1, padding: '1.5rem 1.5rem 1rem', overflowY: 'auto' }}>
        {loading && (
          <p role="status" style={{ textAlign: 'center', opacity: 0.4, fontStyle: 'italic', fontSize: '0.9rem' }}>Loading…</p>
        )}

        {!loading && messages.length === 0 && (
          <p style={{ textAlign: 'center', opacity: 0.4, fontStyle: 'italic', fontSize: '0.9rem', marginTop: '3rem' }}>
            Nothing said yet — the first word is yours.
          </p>
        )}

        {messages.map((msg, i) => {
          const isMe = msg.sender_clerk_id === currentUserId
          const prev = i > 0 ? messages[i - 1] : null
          const showTime = !prev || new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000
          // Show a read receipt under the most recent message I sent.
          const showReceipt = isMe && i === lastSentIndex

          return (
            <div key={msg.id}>
              {showTime && (
                <p style={{ textAlign: 'center', fontSize: '0.68rem', opacity: 0.3, margin: '1rem 0 0.5rem', letterSpacing: '0.05em' }}>
                  {formatTime(msg.created_at)}
                </p>
              )}
              <div style={{
                display: 'flex',
                justifyContent: isMe ? 'flex-end' : 'flex-start',
                marginBottom: '0.35rem',
              }}>
                <div
                  aria-label={`${isMe ? 'You' : displayName} said`}
                  style={{
                  maxWidth: '72%',
                  padding: '0.6rem 0.9rem',
                  borderRadius: isMe ? '1.1rem 1.1rem 0.25rem 1.1rem' : '1.1rem 1.1rem 1.1rem 0.25rem',
                  background: isMe
                    ? 'rgb(var(--purple-rgb) / 0.18)'
                    : 'rgb(var(--gold-rgb) / 0.09)',
                  border: isMe
                    ? '1px solid rgb(var(--purple-rgb) / 0.25)'
                    : '1px solid rgb(var(--gold-rgb) / 0.15)',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  color: 'var(--cream)',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.body}
                </div>
              </div>
              {showReceipt && (
                <p
                  aria-live="polite"
                  style={{
                    textAlign: 'right',
                    margin: '0.1rem 0.15rem 0.35rem',
                    fontSize: '0.66rem',
                    letterSpacing: '0.05em',
                    color: msg.read ? 'var(--purple)' : 'var(--cream)',
                    opacity: msg.read ? 0.7 : 0.35,
                  }}
                >
                  {msg.read
                    ? `Read${msg.read_at ? ` · ${formatTime(msg.read_at)}` : ''}`
                    : 'Delivered'}
                </p>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Compose — or a notice when the other member is no longer active */}
      {!recipientActive ? (
        <div className="glass-bar" style={{
          padding: '1.1rem 1.5rem 2rem',
          borderTop: '1px solid rgb(var(--gold-rgb) / 0.12)',
          position: 'sticky',
          bottom: 0,
          ['--glass-bg' as string]: 'rgb(var(--ink-rgb) / 0.92)',
        }}>
          <p style={{ textAlign: 'center', fontSize: '0.8rem', opacity: 0.45, fontStyle: 'italic', margin: 0 }}>
            This member is no longer active. You can read this conversation but can&rsquo;t reply.
          </p>
        </div>
      ) : (
      <div className="glass-bar" style={{
        padding: '0.85rem 1.5rem 2rem',
        borderTop: '1px solid rgb(var(--gold-rgb) / 0.12)',
        position: 'sticky',
        bottom: 0,
        ['--glass-bg' as string]: 'rgb(var(--ink-rgb) / 0.92)',
      }}>
        {error && (
          <p role="alert" style={{ color: '#f87171', fontSize: '0.78rem', marginBottom: '0.5rem', opacity: 0.85 }}>{error}</p>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <label htmlFor="message-compose" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}>
              {`Message ${displayName}`}
            </label>
            <textarea
              id="message-compose"
              ref={textareaRef}
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${displayName}…`}
              aria-label={`Message ${displayName}`}
              aria-describedby="message-compose-hint"
              maxLength={MAX_CHARS}
              rows={1}
              style={{
                width: '100%',
                padding: '0.65rem 0.9rem',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${isOver ? 'rgba(248,113,113,0.5)' : 'rgb(var(--gold-rgb) / 0.2)'}`,
                borderRadius: '0.75rem',
                color: 'var(--cream)',
                fontSize: '0.9rem',
                resize: 'none',
                outline: 'none',
                fontFamily: 'var(--font-libre-baskerville), Georgia, serif',
                lineHeight: 1.5,
                transition: 'border-color 0.15s',
                boxSizing: 'border-box',
                maxHeight: '160px',
                overflowY: 'hidden',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgb(var(--purple-rgb) / 0.45)' }}
              onBlur={e => { e.target.style.borderColor = isOver ? 'rgba(248,113,113,0.5)' : 'rgb(var(--gold-rgb) / 0.2)' }}
            />
            {body.length > MAX_CHARS * 0.8 && (
              <span aria-live="polite" style={{
                position: 'absolute', bottom: '0.45rem', right: '0.6rem',
                fontSize: '0.65rem', opacity: 0.4,
                color: isOver ? '#f87171' : 'var(--cream)',
              }}>
                <span style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}>characters remaining: </span>
                {charsLeft}
              </span>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={!body.trim() || sending || isOver}
            aria-label="Send message"
            style={{
              padding: '0.65rem 1.25rem',
              background: body.trim() && !isOver ? 'rgb(var(--purple-rgb) / 0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${body.trim() && !isOver ? 'rgb(var(--purple-rgb) / 0.4)' : 'rgb(var(--gold-rgb) / 0.1)'}`,
              borderRadius: '0.75rem',
              color: body.trim() && !isOver ? 'var(--purple)' : 'var(--cream)',
              fontSize: '0.82rem',
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.06em',
              cursor: body.trim() && !isOver && !sending ? 'pointer' : 'not-allowed',
              opacity: body.trim() && !isOver && !sending ? 1 : 0.35,
              transition: 'all 0.15s',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
        <p id="message-compose-hint" style={{ fontSize: '0.68rem', opacity: 0.25, marginTop: '0.4rem', marginBottom: 0 }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>
      )}
    </div>
  )
}

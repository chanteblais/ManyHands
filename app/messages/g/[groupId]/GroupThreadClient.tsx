'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabaseResizedUrl } from '@/lib/supabase-image'
import { IconImage, ROUND_FILL } from '@/components/IconImage'
import { useConfirm } from '../../../components/ConfirmDialog'

type GroupMessage = {
  id: string
  sender_clerk_id: string
  sender_name: string
  avatar_url: string | null
  body: string
  created_at: string
  parent_message_id: string | null
}

type Member = { userId: string; displayName: string; avatarUrl: string | null }

type Props = {
  currentUserId: string
  groupId: string
  groupName: string
  groupIcon: string | null
  groupIconImage: string | null
  members: Member[]
  canLeave: boolean
  initialMuted: boolean
  initialEmailOptIn: boolean
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Find an in-progress @mention immediately before the caret, e.g. "hey @ja|".
// Returns the partial query and the index of the '@', or null.
function detectMention(text: string, caret: number): { query: string; at: number } | null {
  const upto = text.slice(0, caret)
  const m = /(?:^|\s)@([^\s@]*)$/.exec(upto)
  if (!m) return null
  return { query: m[1], at: caret - m[1].length - 1 }
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

function Avatar({ url, name, size = 30 }: { url: string | null; name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      border: '1px solid rgba(111,73,31,0.7)', background: 'rgb(var(--gold-rgb) / 0.08)',
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={supabaseResizedUrl(url, size * 2) ?? ''} loading="lazy" decoding="async" alt={`${name}'s avatar`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span aria-hidden="true" style={{ fontFamily: 'var(--font-display)', fontSize: size * 0.42, color: 'var(--gold)', opacity: 0.6 }}>{name.charAt(0).toUpperCase()}</span>}
    </div>
  )
}

function MessageBubble({ msg, isMe, showSender, avatarSize = 30, renderBody }: { msg: GroupMessage; isMe: boolean; showSender: boolean; avatarSize?: number; renderBody: (body: string) => React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', gap: '0.55rem', marginBottom: '0.35rem' }}>
      {!isMe && (
        <div style={{ width: avatarSize, flexShrink: 0 }}>
          {showSender && <Avatar url={msg.avatar_url} name={msg.sender_name} size={avatarSize} />}
        </div>
      )}
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
        {showSender && !isMe && (
          <span style={{ fontSize: '0.7rem', color: 'var(--gold)', opacity: 0.7, margin: '0 0.2rem 0.2rem' }}>{msg.sender_name}</span>
        )}
        <div
          aria-label={`${isMe ? 'You' : msg.sender_name} said`}
          style={{
            padding: '0.6rem 0.9rem',
            borderRadius: isMe ? '1.1rem 1.1rem 0.25rem 1.1rem' : '1.1rem 1.1rem 1.1rem 0.25rem',
            background: isMe ? 'rgb(var(--purple-rgb) / 0.18)' : 'rgb(var(--gold-rgb) / 0.09)',
            border: isMe ? '1px solid rgb(var(--purple-rgb) / 0.25)' : '1px solid rgb(var(--gold-rgb) / 0.15)',
            fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--cream)',
            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          }}
        >
          {renderBody(msg.body)}
        </div>
      </div>
    </div>
  )
}

export function GroupThreadClient({ currentUserId, groupId, groupName, groupIcon, groupIconImage, members, canLeave, initialMuted, initialEmailOptIn }: Props) {
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [muted, setMuted] = useState(initialMuted)
  const [emailOptIn, setEmailOptIn] = useState(initialEmailOptIn)
  const [leaving, setLeaving] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [replySending, setReplySending] = useState<string | null>(null)
  // @mention autocomplete state for the main composer.
  const [mention, setMention] = useState<{ query: string; at: number } | null>(null)
  const [mentionHighlight, setMentionHighlight] = useState(0)
  const caretToRestore = useRef<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { confirm, confirmDialog } = useConfirm()

  // Close the bell menu on an outside click or Escape. (A fixed overlay doesn't
  // work here — the header's backdrop-filter traps `position: fixed` to the header.)
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const mentionMatches = useMemo(() => {
    if (!mention) return []
    const q = mention.query.toLowerCase()
    return members.filter(m => m.userId !== currentUserId && m.displayName.toLowerCase().includes(q)).slice(0, 6)
  }, [mention, members, currentUserId])

  // Highlight @mentions of group members in message bodies (linked to their profile;
  // a mention of you is styled distinctly). Matches member display names — the same
  // basis the server uses to decide who actually got notified.
  const memberByName = useMemo(() => {
    const map = new Map<string, Member>()
    for (const m of members) if (m.displayName) map.set(m.displayName.toLowerCase(), m)
    return map
  }, [members])

  const mentionRegex = useMemo(() => {
    const names = members.map(m => m.displayName).filter(Boolean).sort((a, b) => b.length - a.length)
    if (!names.length) return null
    return new RegExp(`@(${names.map(escapeRegExp).join('|')})(?![\\w])`, 'gi')
  }, [members])

  const renderBody = useCallback((body: string): React.ReactNode => {
    if (!mentionRegex) return body
    const out: React.ReactNode[] = []
    let last = 0
    mentionRegex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = mentionRegex.exec(body)) !== null) {
      const start = m.index
      if (start > last) out.push(body.slice(last, start))
      const mem = memberByName.get(m[1].toLowerCase())
      if (mem) {
        const isSelf = mem.userId === currentUserId
        out.push(
          <a
            key={start}
            href={`/members/${mem.userId}`}
            title={`View ${mem.displayName}'s profile`}
            style={{
              color: isSelf ? '#FFF1C2' : '#F8DBFF',
              background: isSelf ? 'rgb(var(--gold-rgb) / 0.45)' : 'rgb(var(--purple-rgb) / 0.42)',
              border: `1px solid ${isSelf ? 'rgb(var(--gold-rgb) / 0.4)' : 'rgb(var(--purple-rgb) / 0.4)'}`,
              borderRadius: '0.35rem', padding: '0.05rem 0.3rem', fontWeight: 700,
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            {m[0]}
          </a>,
        )
      } else {
        out.push(m[0])
      }
      last = start + m[0].length
    }
    if (last < body.length) out.push(body.slice(last))
    return out
  }, [mentionRegex, memberByName, currentUserId])

  const topLevel = useMemo(() => messages.filter(m => !m.parent_message_id), [messages])
  const repliesByParent = useMemo(() => {
    const map: Record<string, GroupMessage[]> = {}
    for (const m of messages) {
      if (m.parent_message_id) (map[m.parent_message_id] ??= []).push(m)
    }
    return map
  }, [messages])

  const markRead = useCallback(async () => {
    try {
      await fetch(`/api/messages/g/${groupId}/read`, { method: 'POST' })
      window.dispatchEvent(new Event('glaum:messages-read'))
    } catch {
      // Best-effort.
    }
  }, [groupId])

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages/g/${groupId}`, { cache: 'no-store' })
      const data = await res.json()
      const fetched: GroupMessage[] = data.messages ?? []
      setMessages(fetched)
      setLoading(false)
      if (fetched.length) await markRead()
    } catch {
      setLoading(false)
    }
  }, [groupId, markRead])

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

  // Scroll to bottom on load and when a new top-level message arrives (not on
  // reply changes, which would yank you away from a thread you're reading).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [topLevel.length])

  const toggleThread = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const savePref = async (patch: { muted?: boolean; email_opt_in?: boolean }) => {
    try {
      await fetch(`/api/messages/g/${groupId}/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      // Mute changes the unread badge — nudge it to refresh.
      window.dispatchEvent(new Event('glaum:messages-read'))
    } catch {
      // Best-effort.
    }
  }

  const toggleMute = () => { const v = !muted; setMuted(v); savePref({ muted: v }) }
  const toggleEmail = () => { const v = !emailOptIn; setEmailOptIn(v); savePref({ email_opt_in: v }) }

  const leaveGroup = async () => {
    if (leaving) return
    const ok = await confirm({
      title: `Leave ${groupName}?`,
      body: "You'll stop seeing this thread.",
      confirmLabel: 'Leave group',
      danger: true,
    })
    if (!ok) return
    setLeaving(true)
    try {
      const res = await fetch(`/api/groups/${groupId}/leave`, { method: 'POST' })
      if (res.ok) { window.location.href = '/messages'; return }
      const d = await res.json().catch(() => ({}))
      await confirm({ title: 'Could not leave the group', body: d.error ?? 'Something went wrong — try again in a moment.', notice: true })
    } catch {
      await confirm({ title: 'Could not leave the group', body: 'Something went wrong — try again in a moment.', notice: true })
    }
    setLeaving(false)
  }

  const menuItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
    width: '100%', padding: '0.65rem 0.9rem', textAlign: 'left',
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: 'var(--cream)', fontSize: '0.82rem', fontFamily: 'var(--font-libre-baskerville), Georgia, serif',
  }

  // Composer change → update text and re-detect an in-progress @mention.
  const onComposerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setBody(value)
    setMention(detectMention(value, e.target.selectionStart ?? value.length))
    setMentionHighlight(0)
  }

  // Replace the in-progress "@query" with the chosen member's exact name.
  const selectMention = (m: Member) => {
    if (!mention) return
    const caret = mention.at + 1 + mention.query.length
    const before = body.slice(0, mention.at)
    const insert = `@${m.displayName} `
    const next = `${before}${insert}${body.slice(caret)}`
    caretToRestore.current = (before + insert).length
    setBody(next)
    setMention(null)
  }

  // Restore the caret after a mention insertion shifts the text.
  useEffect(() => {
    if (caretToRestore.current != null && textareaRef.current) {
      const pos = caretToRestore.current
      caretToRestore.current = null
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(pos, pos)
    }
  }, [body])

  // Size the composer to its content, up to the 160px cap — an effect rather
  // than onInput so programmatic changes (the post-send clear, mention
  // insertion) resize too. scrollHeight excludes the border that the
  // border-box height includes; add it back or the box sits 2px short and
  // grows a permanent scrollbar.
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

    const res = await fetch(`/api/messages/g/${groupId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: trimmed }),
    })

    if (res.ok) {
      setBody('')
      setMention(null)
      await fetchMessages()
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to send')
    }
    setSending(false)
    textareaRef.current?.focus()
  }

  const sendReply = async (parentId: string) => {
    const trimmed = (replyDrafts[parentId] ?? '').trim()
    if (!trimmed || replySending) return
    setReplySending(parentId)

    const res = await fetch(`/api/messages/g/${groupId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: trimmed, parentMessageId: parentId }),
    })

    if (res.ok) {
      setReplyDrafts(d => ({ ...d, [parentId]: '' }))
      setExpanded(prev => new Set(prev).add(parentId))
      await fetchMessages()
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Failed to reply')
    }
    setReplySending(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // When the @mention dropdown is open, keys drive it instead of the composer.
    if (mention && mentionMatches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionHighlight(h => (h + 1) % mentionMatches.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionHighlight(h => (h - 1 + mentionMatches.length) % mentionMatches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMention(mentionMatches[mentionHighlight]); return }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
    }
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
        display: 'flex', alignItems: 'center', gap: '0.85rem',
        position: 'sticky', top: 0,
        ['--glass-bg' as string]: 'rgb(var(--ink-rgb) / 0.92)',
        zIndex: 10,
      }}>
        <a href="/messages" aria-label="Back to all messages" style={{ color: 'var(--gold)', opacity: 0.5, textDecoration: 'none', fontSize: '0.8rem', letterSpacing: '0.08em', flexShrink: 0 }}>
          <span aria-hidden="true">←</span>
        </a>
        <div style={{
          width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
          border: '1px solid rgba(111,73,31,0.7)', background: 'rgb(var(--gold-rgb) / 0.08)',
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.15rem',
        }}>
          {groupIconImage
            ? <IconImage src={groupIconImage} size="100%" fill={ROUND_FILL} />
            : <span aria-hidden="true">{groupIcon || '✦'}</span>}
        </div>
        <div>
          <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--gold)' }}>{groupName}</p>
          <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.4 }}>Group thread{muted ? ' · Muted' : ''}</p>
        </div>

        {/* Thread options */}
        <div ref={menuRef} style={{ marginLeft: 'auto', position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={muted ? 'Muted — notification settings' : 'Notification settings'}
            title={muted ? 'Muted — notification settings' : 'Notification settings'}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{ background: 'none', border: 'none', color: muted ? 'var(--cream)' : 'var(--gold)', opacity: muted ? 0.5 : 0.8, cursor: 'pointer', lineHeight: 0, padding: '0.25rem 0.4rem', display: 'flex', alignItems: 'center' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              {muted && <line x1="3" y1="3" x2="21" y2="21" />}
            </svg>
          </button>
          {menuOpen && (
            <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: '230px', background: 'rgba(22,8,34,0.98)', border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '0.7rem', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 21 }}>
                <button role="menuitemcheckbox" aria-checked={muted} onClick={toggleMute} style={menuItemStyle}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                    <span>Mute this group</span>
                    <span style={{ fontSize: '0.66rem', opacity: 0.4 }}>Stop showing an unread badge</span>
                  </span>
                  <span aria-hidden="true" style={{ fontSize: '1rem', color: muted ? 'var(--purple)' : 'var(--cream)', opacity: muted ? 0.95 : 0.4 }}>{muted ? '☑' : '☐'}</span>
                </button>
                <button role="menuitemcheckbox" aria-checked={emailOptIn} onClick={toggleEmail} style={{ ...menuItemStyle, borderTop: '1px solid rgb(var(--gold-rgb) / 0.1)' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                    <span>Email me about this group</span>
                    <span style={{ fontSize: '0.66rem', opacity: 0.4 }}>Get an email when there&rsquo;s activity</span>
                  </span>
                  <span aria-hidden="true" style={{ fontSize: '1rem', color: emailOptIn ? 'var(--purple)' : 'var(--cream)', opacity: emailOptIn ? 0.95 : 0.4 }}>{emailOptIn ? '☑' : '☐'}</span>
                </button>
                {canLeave && (
                  <button role="menuitem" onClick={() => { setMenuOpen(false); leaveGroup() }} disabled={leaving} style={{ ...menuItemStyle, color: 'var(--danger)', borderTop: '1px solid rgb(var(--gold-rgb) / 0.12)' }}>
                    {leaving ? 'Leaving…' : 'Leave group'}
                  </button>
                )}
              </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div role="log" aria-label={`${groupName} thread`} aria-live="polite" aria-relevant="additions" style={{ flex: 1, padding: '1.5rem 1.5rem 1rem', overflowY: 'auto' }}>
        {loading && (
          <p role="status" style={{ textAlign: 'center', opacity: 0.4, fontStyle: 'italic', fontSize: '0.9rem' }}>Loading…</p>
        )}

        {!loading && topLevel.length === 0 && (
          <p style={{ textAlign: 'center', opacity: 0.4, fontStyle: 'italic', fontSize: '0.9rem', marginTop: '3rem' }}>
            Nothing said here yet — the first word is yours.
          </p>
        )}

        {topLevel.map((msg, i) => {
          // Private system note (the group welcome). The API only returns these
          // to the member they address ('system' is the sentinel sender — not a
          // clerk id; kept literal here so this client bundle doesn't import
          // server-only lib/conversations). Centered ceremonial note: no bubble,
          // no avatar, no reply affordance.
          if (msg.sender_clerk_id === 'system') {
            return (
              <div key={msg.id} style={{ textAlign: 'center', margin: '1.4rem 0', padding: '0 1rem' }}>
                <p style={{ color: 'var(--gold)', fontSize: '0.88rem', fontStyle: 'italic', lineHeight: 1.55, margin: 0 }}>
                  {msg.body}
                </p>
                <p style={{ fontSize: '0.65rem', opacity: 0.35, margin: '0.3rem 0 0', letterSpacing: '0.05em' }}>
                  Only visible to you
                </p>
              </div>
            )
          }

          const isMe = msg.sender_clerk_id === currentUserId
          const prev = i > 0 ? topLevel[i - 1] : null
          const showTime = !prev || new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000
          const startsRun = !prev || prev.sender_clerk_id !== msg.sender_clerk_id || showTime

          const replies = repliesByParent[msg.id] ?? []
          const isExpanded = expanded.has(msg.id)

          return (
            <div key={msg.id}>
              {showTime && (
                <p style={{ textAlign: 'center', fontSize: '0.68rem', opacity: 0.3, margin: '1rem 0 0.5rem', letterSpacing: '0.05em' }}>
                  {formatTime(msg.created_at)}
                </p>
              )}

              <MessageBubble msg={msg} isMe={isMe} showSender={startsRun} renderBody={renderBody} />

              {/* Reply affordance */}
              <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', paddingLeft: isMe ? 0 : '0.55rem', marginBottom: '0.15rem' }}>
                <button
                  onClick={() => toggleThread(msg.id)}
                  aria-expanded={isExpanded}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: replies.length ? 'var(--gold)' : 'var(--cream)',
                    opacity: replies.length ? 0.7 : 0.4,
                    fontSize: '0.7rem', letterSpacing: '0.04em',
                    padding: '0.1rem 0.3rem', marginLeft: isMe ? 0 : '2.6rem',
                  }}
                >
                  {replies.length > 0
                    ? <>💬 {replies.length} repl{replies.length === 1 ? 'y' : 'ies'} {isExpanded ? '▲' : '▾'}</>
                    : <>↳ Reply</>}
                </button>
              </div>

              {/* Reply thread (one level, collapsible) */}
              {isExpanded && (
                <div style={{ marginLeft: '2.6rem', paddingLeft: '0.85rem', borderLeft: '1px solid rgb(var(--gold-rgb) / 0.18)', marginBottom: '0.6rem' }}>
                  {replies.map((r, ri) => {
                    const rIsMe = r.sender_clerk_id === currentUserId
                    const rPrev = ri > 0 ? replies[ri - 1] : null
                    const rStartsRun = !rPrev || rPrev.sender_clerk_id !== r.sender_clerk_id
                    return <MessageBubble key={r.id} msg={r} isMe={rIsMe} showSender={rStartsRun} avatarSize={24} renderBody={renderBody} />
                  })}

                  {/* Reply composer */}
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.4rem' }}>
                    <input
                      type="text"
                      value={replyDrafts[msg.id] ?? ''}
                      onChange={e => setReplyDrafts(d => ({ ...d, [msg.id]: e.target.value.slice(0, MAX_CHARS) }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendReply(msg.id) } }}
                      placeholder="Reply…"
                      aria-label={`Reply to ${msg.sender_name}`}
                      style={{
                        flex: 1, padding: '0.5rem 0.75rem',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgb(var(--gold-rgb) / 0.2)',
                        borderRadius: '0.6rem', color: 'var(--cream)', fontSize: '0.85rem',
                        outline: 'none', boxSizing: 'border-box',
                        fontFamily: 'var(--font-libre-baskerville), Georgia, serif',
                      }}
                      onFocus={e => { e.target.style.borderColor = 'rgb(var(--purple-rgb) / 0.45)' }}
                      onBlur={e => { e.target.style.borderColor = 'rgb(var(--gold-rgb) / 0.2)' }}
                    />
                    <button
                      onClick={() => sendReply(msg.id)}
                      disabled={!(replyDrafts[msg.id] ?? '').trim() || replySending === msg.id}
                      aria-label="Send reply"
                      style={{
                        padding: '0.5rem 0.9rem',
                        background: (replyDrafts[msg.id] ?? '').trim() ? 'rgb(var(--purple-rgb) / 0.2)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${(replyDrafts[msg.id] ?? '').trim() ? 'rgb(var(--purple-rgb) / 0.4)' : 'rgb(var(--gold-rgb) / 0.1)'}`,
                        borderRadius: '0.6rem',
                        color: (replyDrafts[msg.id] ?? '').trim() ? 'var(--purple)' : 'var(--cream)',
                        fontSize: '0.75rem', fontFamily: 'var(--font-display)', letterSpacing: '0.05em',
                        cursor: (replyDrafts[msg.id] ?? '').trim() && replySending !== msg.id ? 'pointer' : 'not-allowed',
                        opacity: (replyDrafts[msg.id] ?? '').trim() && replySending !== msg.id ? 1 : 0.35,
                        flexShrink: 0, whiteSpace: 'nowrap',
                      }}
                    >
                      {replySending === msg.id ? '…' : 'Reply'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="glass-bar" style={{
        padding: '0.85rem 1.5rem 2rem',
        borderTop: '1px solid rgb(var(--gold-rgb) / 0.12)',
        position: 'sticky', bottom: 0,
        ['--glass-bg' as string]: 'rgb(var(--ink-rgb) / 0.92)',
      }}>
        {error && (
          <p role="alert" style={{ color: '#f87171', fontSize: '0.78rem', marginBottom: '0.5rem', opacity: 0.85 }}>{error}</p>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            {/* @mention autocomplete */}
            {mention && mentionMatches.length > 0 && (
              <div role="listbox" aria-label="Mention a member" style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
                background: 'rgba(22,8,34,0.98)', border: '1px solid rgb(var(--gold-rgb) / 0.25)',
                borderRadius: '0.6rem', boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                overflow: 'hidden', zIndex: 20,
              }}>
                {mentionMatches.map((m, i) => (
                  <button
                    key={m.userId}
                    role="option"
                    aria-selected={i === mentionHighlight}
                    onMouseDown={e => { e.preventDefault(); selectMention(m) }}
                    onMouseEnter={() => setMentionHighlight(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                      padding: '0.5rem 0.75rem', textAlign: 'left', cursor: 'pointer',
                      background: i === mentionHighlight ? 'rgb(var(--purple-rgb) / 0.15)' : 'transparent',
                      border: 'none', color: 'var(--cream)',
                    }}
                  >
                    <Avatar url={m.avatarUrl} name={m.displayName} size={24} />
                    <span style={{ fontSize: '0.85rem' }}>{m.displayName}</span>
                  </button>
                ))}
              </div>
            )}
            <label htmlFor="group-compose" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}>
              {`Message ${groupName}`}
            </label>
            <textarea
              id="group-compose"
              ref={textareaRef}
              value={body}
              onChange={onComposerChange}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${groupName}…`}
              aria-label={`Message ${groupName}`}
              maxLength={MAX_CHARS}
              rows={1}
              style={{
                width: '100%', padding: '0.65rem 0.9rem',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${isOver ? 'rgba(248,113,113,0.5)' : 'rgb(var(--gold-rgb) / 0.2)'}`,
                borderRadius: '0.75rem', color: 'var(--cream)', fontSize: '0.9rem',
                resize: 'none', outline: 'none',
                fontFamily: 'var(--font-libre-baskerville), Georgia, serif',
                lineHeight: 1.5, transition: 'border-color 0.15s', boxSizing: 'border-box',
                maxHeight: '160px', overflowY: 'hidden',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgb(var(--purple-rgb) / 0.45)' }}
              onBlur={e => { e.target.style.borderColor = isOver ? 'rgba(248,113,113,0.5)' : 'rgb(var(--gold-rgb) / 0.2)' }}
            />
            {body.length > MAX_CHARS * 0.8 && (
              <span aria-live="polite" style={{ position: 'absolute', bottom: '0.45rem', right: '0.6rem', fontSize: '0.65rem', opacity: 0.4, color: isOver ? '#f87171' : 'var(--cream)' }}>
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
              fontSize: '0.82rem', fontFamily: 'var(--font-display)', letterSpacing: '0.06em',
              cursor: body.trim() && !isOver && !sending ? 'pointer' : 'not-allowed',
              opacity: body.trim() && !isOver && !sending ? 1 : 0.35,
              transition: 'all 0.15s', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
        <p style={{ fontSize: '0.68rem', opacity: 0.25, marginTop: '0.4rem', marginBottom: 0 }}>
          Enter to send · Shift+Enter for new line
        </p>
      </div>

      {confirmDialog}
    </div>
  )
}

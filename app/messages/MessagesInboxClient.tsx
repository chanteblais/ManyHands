'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabaseResizedUrl } from '@/lib/supabase-image'
import { IconImage, ROUND_FILL } from '@/components/IconImage'
import type { MemberOption } from './page'

type Conversation = {
  kind: 'direct' | 'group'
  otherUserId?: string | null // direct
  groupId?: string | null     // group
  displayName: string
  avatarUrl: string | null    // direct
  icon?: string | null        // group
  iconImage?: string | null   // group: uploaded icon art (wins over the emoji glyph)
  muted?: boolean
  lastMessage: string | null
  lastMessageAt: string | null
  lastMessageFromMe: boolean
  unreadCount: number
}

// Where a conversation row links, and a stable key for it.
function convHref(c: Conversation) {
  return c.kind === 'group' ? `/messages/g/${c.groupId}` : `/messages/${c.otherUserId}`
}
function convKey(c: Conversation) {
  return c.kind === 'group' ? `g:${c.groupId}` : `d:${c.otherUserId}`
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

// Read/unread status label for a conversation row.
// - Incoming unread messages → "Unread"
// - Incoming, all read → "Read"
// - Outgoing last message → "Sent"
function ReadStatus({ conv }: { conv: Conversation }) {
  // No status for an empty group thread (nothing sent/received yet).
  if (conv.lastMessageAt == null) return null

  let label: string
  let color: string
  let unread = false

  if (conv.lastMessageFromMe) {
    label = 'Sent'
    color = 'var(--cream)'
  } else if (conv.unreadCount > 0) {
    label = 'Unread'
    color = 'var(--purple)'
    unread = true
  } else {
    label = 'Read'
    color = 'var(--gold)'
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase',
      color, opacity: unread ? 0.95 : 0.45, fontWeight: unread ? 700 : 500,
    }}>
      <span aria-hidden="true" style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: color, opacity: unread ? 1 : 0.6, display: 'inline-block',
      }} />
      {label}
    </span>
  )
}

function Avatar({ avatarUrl, displayName, size = 44, icon, iconImage }: { avatarUrl: string | null; displayName: string; size?: number; icon?: string | null; iconImage?: string | null }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      border: '1px solid rgba(111,73,31,0.7)',
      background: 'rgb(var(--gold-rgb) / 0.08)',
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {iconImage ? (
        // Group with uploaded icon art.
        <IconImage src={iconImage} size="100%" fill={ROUND_FILL} />
      ) : icon !== undefined ? (
        // Group: show its icon glyph (falls back to ✦).
        <span aria-hidden="true" style={{ fontSize: size * 0.45 }}>{icon || '✦'}</span>
      ) : avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={supabaseResizedUrl(avatarUrl, size * 2) ?? ''} loading="lazy" decoding="async" alt={`${displayName}'s avatar`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span aria-hidden="true" style={{ fontFamily: 'var(--font-display)', fontSize: size * 0.4, color: 'var(--gold)', opacity: 0.6 }}>
          {displayName.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}

function NewMessageModal({ members, onClose }: { members: MemberOption[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = query.trim()
    ? members.filter(m => m.displayName.toLowerCase().includes(query.toLowerCase()))
    : members

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-message-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(10,4,18,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: '420px',
        background: 'rgba(22,8,34,0.98)',
        border: '1px solid rgb(var(--gold-rgb) / 0.2)',
        borderRadius: '1.1rem',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{ padding: '1.1rem 1.25rem 0.85rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span id="new-message-title" style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--gold)' }}>New Message</span>
          <button onClick={onClose} aria-label="Close new message dialog" style={{ background: 'none', border: 'none', color: 'var(--cream)', opacity: 0.4, cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0.1rem 0.3rem' }}><span aria-hidden="true">×</span></button>
        </div>

        {/* Search */}
        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.08)' }}>
          <label htmlFor="new-message-search" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}>
            Search members
          </label>
          <input
            id="new-message-search"
            ref={inputRef}
            type="text"
            placeholder="Search members…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search members"
            style={{
              width: '100%', padding: '0.55rem 0.75rem',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgb(var(--gold-rgb) / 0.18)',
              borderRadius: '0.6rem',
              color: 'var(--cream)', fontSize: '0.9rem',
              outline: 'none', boxSizing: 'border-box',
              fontFamily: 'var(--font-libre-baskerville), Georgia, serif',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgb(var(--purple-rgb) / 0.45)' }}
            onBlur={e => { e.target.style.borderColor = 'rgb(var(--gold-rgb) / 0.18)' }}
          />
        </div>

        {/* Member list */}
        <div role="list" aria-label="Members" style={{ maxHeight: '340px', overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <p role="status" style={{ padding: '1.5rem 1.25rem', fontSize: '0.85rem', opacity: 0.4, fontStyle: 'italic', margin: 0, textAlign: 'center' }}>No one by that name.</p>
          ) : (
            filtered.map(m => (
              <a
                key={m.userId}
                href={`/messages/${m.userId}`}
                role="listitem"
                aria-label={`Message ${m.displayName}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.85rem',
                  padding: '0.75rem 1.25rem',
                  textDecoration: 'none', color: 'inherit',
                  borderBottom: '1px solid rgb(var(--gold-rgb) / 0.06)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <Avatar avatarUrl={m.avatarUrl} displayName={m.displayName} size={36} />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', color: 'var(--cream)', opacity: 0.9 }}>
                  {m.displayName}
                </span>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

type JoinableGroup = { id: string; name: string; icon: string | null; icon_image: string | null; description: string | null; member_count: number }

function FindGroupModal({ onClose, onJoined }: { onClose: () => void; onJoined: () => void }) {
  const [groups, setGroups] = useState<JoinableGroup[] | null>(null)
  const [query, setQuery] = useState('')
  const [joining, setJoining] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/groups/joinable', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setGroups(d.groups ?? []))
      .catch(() => setGroups([]))
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = (groups ?? []).filter(g => !query.trim() || g.name.toLowerCase().includes(query.toLowerCase()))

  async function join(id: string) {
    setJoining(id)
    try {
      const res = await fetch(`/api/groups/${id}/join`, { method: 'POST' })
      if (res.ok) {
        setGroups(prev => (prev ?? []).filter(g => g.id !== id))
        onJoined()
      }
    } finally {
      setJoining(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="find-group-title"
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,4,18,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: '100%', maxWidth: '440px', background: 'rgba(22,8,34,0.98)', border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '1.1rem', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
        <div style={{ padding: '1.1rem 1.25rem 0.85rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span id="find-group-title" style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--gold)' }}>Find a group</span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--cream)', opacity: 0.4, cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0.1rem 0.3rem' }}><span aria-hidden="true">×</span></button>
        </div>

        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.08)' }}>
          <input
            type="text"
            placeholder="Search groups…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search groups"
            style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgb(var(--gold-rgb) / 0.18)', borderRadius: '0.6rem', color: 'var(--cream)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-libre-baskerville), Georgia, serif' }}
          />
        </div>

        <div role="list" aria-label="Open groups" style={{ maxHeight: '360px', overflowY: 'auto' }}>
          {groups === null ? (
            <p role="status" style={{ padding: '1.5rem 1.25rem', fontSize: '0.85rem', opacity: 0.4, fontStyle: 'italic', margin: 0, textAlign: 'center' }}>Loading…</p>
          ) : filtered.length === 0 ? (
            <p role="status" style={{ padding: '1.5rem 1.25rem', fontSize: '0.85rem', opacity: 0.4, fontStyle: 'italic', margin: 0, textAlign: 'center' }}>
              {query.trim() ? 'No matching groups.' : 'No open groups to join right now.'}
            </p>
          ) : (
            filtered.map(g => (
              <div key={g.id} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.06)' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, border: '1px solid rgba(111,73,31,0.7)', background: 'rgb(var(--gold-rgb) / 0.08)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                  {g.icon_image
                    ? <IconImage src={g.icon_image} size="100%" fill={ROUND_FILL} />
                    : <span aria-hidden="true">{g.icon || '✦'}</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '0.92rem', color: 'var(--cream)', opacity: 0.9 }}>{g.name}</p>
                  <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.description || `${g.member_count} member${g.member_count === 1 ? '' : 's'}`}
                  </p>
                </div>
                <button
                  onClick={() => join(g.id)}
                  disabled={joining === g.id}
                  style={{ flexShrink: 0, padding: '0.4rem 0.95rem', borderRadius: '9999px', border: '1px solid rgb(var(--purple-rgb) / 0.4)', background: 'rgb(var(--purple-rgb) / 0.15)', color: 'var(--purple)', fontSize: '0.75rem', fontFamily: 'var(--font-display)', letterSpacing: '0.06em', cursor: joining === g.id ? 'default' : 'pointer', opacity: joining === g.id ? 0.5 : 1 }}
                >
                  {joining === g.id ? 'Joining…' : 'Join'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

type Filter = 'all' | 'direct' | 'group'

export function MessagesInboxClient({ currentUserId, members, initialConversations }: { currentUserId: string; members: MemberOption[]; initialConversations?: Conversation[] }) {
  // Server-rendered initial inbox (when provided) — paints immediately; the
  // mount fetch below just keeps it fresh.
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations ?? [])
  const [loading, setLoading] = useState(initialConversations == null)
  const [showNewMessage, setShowNewMessage] = useState(false)
  const [showFindGroup, setShowFindGroup] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  const hasGroups = conversations.some(c => c.kind === 'group')
  const hasDirect = conversations.some(c => c.kind === 'direct')
  const visible = conversations.filter(c => filter === 'all' || c.kind === filter)
  const groupUnread = conversations.filter(c => c.kind === 'group').reduce((n, c) => n + c.unreadCount, 0)
  const directUnread = conversations.filter(c => c.kind === 'direct').reduce((n, c) => n + c.unreadCount, 0)

  // Deep-link: /messages?to=<userId> (e.g. from an email "Read & reply" link)
  // jumps straight into that conversation thread.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const to = new URLSearchParams(window.location.search).get('to')
    if (to && to !== currentUserId) {
      window.location.replace(`/messages/${to}`)
    }
  }, [currentUserId])

  const loadConversations = useCallback(() => {
    return fetch('/api/messages')
      .then(r => r.json())
      .then(d => {
        setConversations(d.conversations ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Server-rendered inbox (initialConversations) is fresh at navigation time —
  // dynamic pages skip the client router cache — so only fetch when the prop
  // is absent (client-side error recovery / legacy render paths).
  useEffect(() => {
    if (initialConversations != null) return
    loadConversations()
  }, [initialConversations, loadConversations])

  return (
    <>
      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginBottom: '1.25rem' }}>
        <button
          onClick={() => setShowFindGroup(true)}
          aria-label="Find a group to join"
          aria-haspopup="dialog"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
            padding: '0.5rem 1.1rem',
            background: 'transparent',
            border: '1px solid rgb(var(--gold-rgb) / 0.35)',
            borderRadius: '9999px',
            color: 'var(--gold)',
            fontSize: '0.8rem',
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.08em',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgb(var(--gold-rgb) / 0.1)'; e.currentTarget.style.borderColor = 'rgb(var(--gold-rgb) / 0.6)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgb(var(--gold-rgb) / 0.35)' }}
        >
          <span aria-hidden="true" style={{ fontSize: '0.9rem', lineHeight: 1 }}>✦</span>
          Find a group
        </button>
        <button
          onClick={() => setShowNewMessage(true)}
          aria-label="Start a new message"
          aria-haspopup="dialog"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
            padding: '0.5rem 1.1rem',
            background: 'rgb(var(--purple-rgb) / 0.12)',
            border: '1px solid rgb(var(--purple-rgb) / 0.35)',
            borderRadius: '9999px',
            color: 'var(--purple)',
            fontSize: '0.8rem',
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.08em',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgb(var(--purple-rgb) / 0.2)'; e.currentTarget.style.borderColor = 'rgb(var(--purple-rgb) / 0.6)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgb(var(--purple-rgb) / 0.12)'; e.currentTarget.style.borderColor = 'rgb(var(--purple-rgb) / 0.35)' }}
        >
          <span aria-hidden="true" style={{ fontSize: '1rem', lineHeight: 1 }}>✉</span>
          New Message
        </button>
      </div>

      {/* Filter: All / Direct / Groups (only when there's a mix worth filtering) */}
      {!loading && hasGroups && hasDirect && (
        <div role="tablist" aria-label="Filter conversations" style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
          {([['all', 'All'], ['direct', 'Direct'], ['group', 'Groups']] as [Filter, string][]).map(([val, label]) => {
            const active = filter === val
            const badge = val === 'group' ? groupUnread : val === 'direct' ? directUnread : groupUnread + directUnread
            return (
              <button
                key={val}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(val)}
                style={{
                  padding: '0.4rem 0.9rem', borderRadius: '9999px',
                  border: `1px solid ${active ? 'rgb(var(--purple-rgb) / 0.5)' : 'rgb(var(--gold-rgb) / 0.2)'}`,
                  background: active ? 'rgb(var(--purple-rgb) / 0.15)' : 'transparent',
                  color: active ? 'var(--purple)' : 'var(--cream)', opacity: active ? 1 : 0.6,
                  fontSize: '0.75rem', fontFamily: 'var(--font-display)', letterSpacing: '0.06em',
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                }}
              >
                {label}
                {badge > 0 && (
                  <span aria-hidden="true" style={{ minWidth: '16px', height: '16px', borderRadius: '9999px', background: 'var(--purple)', color: '#fff', fontSize: '0.6rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Conversation list */}
      {loading ? (
        <p role="status" aria-live="polite" style={{ textAlign: 'center', opacity: 0.4, fontStyle: 'italic', fontSize: '0.9rem' }}>Loading…</p>
      ) : conversations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0' }}>
          <p style={{ fontSize: '0.9rem', opacity: 0.4, fontStyle: 'italic', marginBottom: '1.5rem' }}>
            All quiet — nothing passed along yet.
          </p>
          <button
            onClick={() => setShowNewMessage(true)}
            aria-label="Start a conversation"
            aria-haspopup="dialog"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.82rem', color: 'var(--gold)', letterSpacing: '0.06em', opacity: 0.8,
              textDecoration: 'underline', textUnderlineOffset: '3px',
            }}
          >
            Start a conversation →
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '2.5rem 0', fontSize: '0.9rem', opacity: 0.4, fontStyle: 'italic' }}>
          {filter === 'group' ? 'No group threads yet.' : 'No direct messages yet.'}
        </p>
      ) : (
        <ul role="list" aria-label="Conversations" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {visible.map(conv => (
          <li key={convKey(conv)} role="listitem">
          <a
            href={convHref(conv)}
            aria-label={`${conv.kind === 'group' ? 'Group thread' : 'Conversation'}: ${conv.displayName}${conv.unreadCount > 0 ? `, ${conv.unreadCount} unread message${conv.unreadCount === 1 ? '' : 's'}` : conv.lastMessageAt == null ? ', no messages yet' : conv.lastMessageFromMe ? ', last message sent by you' : ', read'}`}
            style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '1rem 1.25rem',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgb(var(--gold-rgb) / 0.12)',
              borderRadius: '0.85rem',
              textDecoration: 'none', color: 'inherit',
              transition: 'border-color 0.2s, background 0.2s',
              marginBottom: '0.75rem',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgb(var(--gold-rgb) / 0.35)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgb(var(--gold-rgb) / 0.12)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
          >
            <Avatar avatarUrl={conv.avatarUrl} displayName={conv.displayName} size={44} icon={conv.kind === 'group' ? (conv.icon ?? null) : undefined} iconImage={conv.kind === 'group' ? conv.iconImage : undefined} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.2rem' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: conv.unreadCount > 0 ? 'var(--gold)' : 'var(--cream)', opacity: conv.unreadCount > 0 ? 1 : 0.85 }}>
                  {conv.displayName}
                  {conv.muted && <span title="Muted" aria-label="muted" style={{ marginLeft: '0.4rem', fontSize: '0.7rem', opacity: 0.5 }}>🔕</span>}
                </span>
                {conv.lastMessageAt && (
                  <span style={{ fontSize: '0.7rem', opacity: 0.35, flexShrink: 0, marginLeft: '0.75rem' }}>
                    {timeAgo(conv.lastMessageAt)}
                  </span>
                )}
              </div>
              <p style={{
                margin: 0, fontSize: '0.82rem',
                opacity: conv.unreadCount > 0 ? 0.75 : 0.4,
                fontWeight: conv.unreadCount > 0 ? 600 : 400,
                fontStyle: conv.lastMessage == null ? 'italic' : 'normal',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {conv.lastMessage == null
                  ? (conv.kind === 'group' ? 'Nothing said yet — the first word is yours' : '')
                  : `${conv.lastMessageFromMe ? 'You: ' : ''}${conv.lastMessage}`}
              </p>
              {/* Read / unread status */}
              <div style={{ marginTop: '0.3rem' }}>
                <ReadStatus conv={conv} />
              </div>
            </div>
            {conv.unreadCount > 0 && (
              <div aria-hidden="true" style={{
                minWidth: '20px', height: '20px', borderRadius: '9999px',
                background: 'var(--purple)', color: '#fff',
                fontSize: '0.65rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 5px', flexShrink: 0,
              }}>
                {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
              </div>
            )}
          </a>
          </li>
          ))}
        </ul>
      )}

      {/* New Message modal */}
      {showNewMessage && (
        <NewMessageModal members={members} onClose={() => setShowNewMessage(false)} />
      )}

      {/* Find a group modal */}
      {showFindGroup && (
        <FindGroupModal onClose={() => setShowFindGroup(false)} onJoined={loadConversations} />
      )}
    </>
  )
}

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Polls the unread-message count and keeps it fresh across focus, route
// changes, and the glaum:messages-read signal. Shared by the nav link, the
// mobile tab bar, and the /messages page badge — the poller and its listeners
// live at MODULE level so any number of mounted consumers share ONE interval
// and ONE in-flight request (each instance previously ran its own 30s poll,
// doubling the sustained request rate whenever two badges were mounted).
let sharedCount = 0
const subscribers = new Set<(n: number) => void>()
let pollerStarted = false
let inflight: Promise<void> | null = null

function refreshShared(): Promise<void> {
  if (!inflight) {
    inflight = fetch('/api/messages/unread', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { count?: number } | null) => {
        sharedCount = d?.count ?? 0
        subscribers.forEach((fn) => fn(sharedCount))
      })
      .catch(() => {})
      .finally(() => { inflight = null })
  }
  return inflight
}

// Started on first consumer mount, never torn down — a badge consumer (header
// or tab bar) is mounted for the whole life of any signed-in page, and the
// listeners are inert while `subscribers` is empty. Polling skips hidden tabs;
// visibility/focus regain refreshes immediately to catch up.
function ensurePoller() {
  if (pollerStarted || typeof window === 'undefined') return
  pollerStarted = true
  setInterval(() => { if (!document.hidden) refreshShared() }, 30_000)
  window.addEventListener('focus', () => { refreshShared() })
  window.addEventListener('glaum:messages-read', () => { refreshShared() })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshShared() })
}

export function useUnreadMessages() {
  const [unread, setUnread] = useState(sharedCount)
  const pathname = usePathname()

  useEffect(() => {
    subscribers.add(setUnread)
    ensurePoller()
    return () => { subscribers.delete(setUnread) }
  }, [])

  // Re-check on route change so the count updates after navigating into/out of
  // /messages; the in-flight dedup collapses simultaneous instances into one
  // request.
  useEffect(() => { refreshShared() }, [pathname])

  return unread
}

export function MessagesNavLink({ style }: { style?: React.CSSProperties }) {
  const unread = useUnreadMessages()

  return (
    <Link
      href="/messages"
      aria-label={unread > 0 ? `Messages — ${unread} unread` : 'Messages'}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        transition: 'opacity 0.2s, color 0.2s',
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--gold)' }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = String(style?.opacity ?? 0.8); e.currentTarget.style.color = String(style?.color ?? 'var(--cream)') }}
    >
      Messages
      {unread > 0 && (
        <span
          aria-hidden="true"
          style={{
            marginLeft: '5px',
            minWidth: '16px',
            height: '16px',
            borderRadius: '9999px',
            background: 'var(--purple)',
            color: '#fff',
            fontSize: '0.6rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            lineHeight: 1,
            verticalAlign: 'middle',
            boxShadow: '0 0 8px rgb(var(--purple-rgb) / 0.5)',
          }}
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
}

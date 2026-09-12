'use client'

import { useState, useEffect, useRef } from 'react'

type UserNotification = {
  id: string
  event_type: string
  message: string
  details: Record<string, unknown> | null
  created_at: string
  read_at: string | null
}

export function UserNotificationBell() {
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.read_at).length
  const recent = notifications.slice(0, 6)

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        setNotifications(json.notifications ?? [])
        setLoaded(true)
      }
    } catch {}
  }

  useEffect(() => {
    fetchNotifications()
    // Skip polls while the tab is hidden.
    const interval = setInterval(() => { if (!document.hidden) fetchNotifications() }, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Mark all read silently — just clear the badge, keep showing notifications
  const markAllRead = () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    )
    fetch('/api/notifications', { method: 'PATCH' }).catch(() => {})
  }

  // Auto-mark as read when dropdown opens
  const toggleOpen = () => {
    setOpen((o) => {
      const next = !o
      if (next && unreadCount > 0) markAllRead()
      return next
    })
  }

  // Don't render until we've loaded (avoids flicker on sign-in)
  if (!loaded && notifications.length === 0) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={toggleOpen}
        aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} unread` : ''}`}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.25rem',
          color: unreadCount > 0 ? 'var(--purple)' : 'var(--cream)',
          opacity: unreadCount > 0 ? 0.9 : 0.35,
          transition: 'opacity 0.15s',
          display: 'flex',
          alignItems: 'center',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = unreadCount > 0 ? '0.9' : '0.35' }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            minWidth: '15px',
            height: '15px',
            borderRadius: '9999px',
            background: 'var(--purple)',
            color: '#fff',
            fontSize: '0.58rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            lineHeight: 1,
            pointerEvents: 'none',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 0.5rem)',
          right: 0,
          width: '300px',
          maxHeight: '380px',
          overflowY: 'auto',
          background: 'rgba(18, 10, 28, 0.97)',
          border: '1px solid rgb(var(--purple-rgb) / 0.25)',
          borderRadius: '0.85rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 100,
        }}>
          <div style={{
            padding: '0.9rem 1.1rem 0.7rem',
            borderBottom: '1px solid rgb(var(--gold-rgb) / 0.1)',
          }}>
            <span style={{ fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--purple)', opacity: 0.85 }}>
              Notifications
            </span>
          </div>

          {recent.length === 0 ? (
            <p style={{ padding: '1.25rem 1.1rem', fontSize: '0.85rem', opacity: 0.4, fontStyle: 'italic', margin: 0 }}>
              Nothing yet
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recent.map((n, i) => {
                const isUnread = !n.read_at
                const when = new Date(n.created_at).toLocaleString('en-CA', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })

                const link: { href: string; label: string } | null = (() => {
                  switch (n.event_type) {
                    case 'application_approved': return { href: '/profile', label: 'Go to profile →' }
                    case 'application_rejected':  return { href: '/apply', label: 'Back to apply →' }
                    case 'role_suggestion_approved': return { href: '/participate#role-signup', label: 'Select your role →' }
                    case 'role_suggestion_rejected': return { href: '/profile', label: 'Go to profile →' }
                    case 'role_request_approved':   return { href: '/profile', label: 'Go to profile →' }
                    case 'role_request_rejected':   return { href: '/participate#role-signup', label: 'Choose another role →' }
                    case 'volunteer_approved':       return { href: '/profile', label: 'Go to profile →' }
                    case 'lead_up_gathering':        return { href: '/schedule', label: 'View gathering →' }
                    case 'radio_broadcast':          return { href: '/radio', label: 'Tune in →' }
                    case 'radio_mention':            return { href: '/radio', label: 'Tune in →' }
                    case 'new_message': {
                      const senderId = (n.details as Record<string,string> | null)?.senderId
                      return senderId ? { href: `/messages/${senderId}`, label: 'View message →' } : { href: '/messages', label: 'View messages →' }
                    }
                    case 'group_mention': {
                      const groupId = (n.details as Record<string,string> | null)?.groupId
                      return groupId ? { href: `/messages/g/${groupId}`, label: 'View thread →' } : { href: '/messages', label: 'View messages →' }
                    }
                    default: return null
                  }
                })()

                return (
                  <div
                    key={n.id}
                    style={{
                      padding: '0.8rem 1.1rem',
                      borderBottom: i < recent.length - 1 ? '1px solid rgb(var(--gold-rgb) / 0.07)' : 'none',
                      background: isUnread ? 'rgb(var(--purple-rgb) / 0.05)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <p style={{ margin: 0, fontSize: '0.84rem', opacity: isUnread ? 0.9 : 0.6, lineHeight: 1.4 }}>
                        {isUnread && (
                          <span style={{
                            display: 'inline-block',
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: 'var(--purple)',
                            marginRight: '6px',
                            verticalAlign: 'middle',
                          }} />
                        )}
                        {n.message}
                      </p>
                      <span style={{ fontSize: '0.68rem', opacity: 0.35, flexShrink: 0, whiteSpace: 'nowrap' }}>{when}</span>
                    </div>
                    {link && (
                      <a
                        href={link.href}
                        onClick={() => setOpen(false)}
                        style={{ display: 'inline-block', marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--gold)', opacity: 0.7, textDecoration: 'none', letterSpacing: '0.04em' }}
                      >
                        {link.label}
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

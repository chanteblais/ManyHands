'use client'

import { useState, useRef, useEffect } from 'react'

type Notification = {
  id: string
  application_id: string | null
  event_type: string
  message: string
  details: { email?: string; reason?: string; note?: string; changes?: Record<string, unknown>; volunteer_id?: string } | null
  created_at: string
  read_at: string | null
}

export function NotificationBell({
  initialNotifications,
}: {
  initialNotifications?: Notification[]
}) {
  const [notifications, setNotifications] = useState(initialNotifications ?? [])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.read_at).length
  // The bell is the only notifications surface, so the dropdown shows the full
  // fetched list (it scrolls) rather than a teaser.
  const recent = notifications

  // Mark all unread as read silently (no router refresh — avoids state reset)
  const markAllRead = async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    )
    fetch('/api/admin/notifications', { method: 'PATCH' }).catch(() => {})
  }

  const clearAll = async () => {
    setNotifications([])
    fetch('/api/admin/notifications', { method: 'DELETE' }).catch(() => {})
  }

  // Auto-mark as read when dropdown opens
  const toggleOpen = () => {
    setOpen((o) => {
      const next = !o
      if (next && unreadCount > 0) markAllRead()
      return next
    })
  }

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

  // Fetch on mount only when no server-rendered list was provided (i.e. the
  // bell is rendered outside the admin pages) — the tabs all pass one, so
  // refetching what the server just sent would waste a round trip.
  useEffect(() => {
    if (initialNotifications !== undefined) return
    fetch('/api/admin/notifications')
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json) setNotifications(json.notifications ?? []) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll for new notifications every 60s (skipped while the tab is hidden)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (document.hidden) return
      try {
        const res = await fetch('/api/admin/notifications')
        if (res.ok) {
          const json = await res.json()
          setNotifications(json.notifications ?? [])
        }
      } catch {}
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
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
        {/* Bell SVG */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {/* Badge */}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            minWidth: '16px',
            height: '16px',
            borderRadius: '9999px',
            background: 'var(--purple)',
            color: '#fff',
            fontSize: '0.6rem',
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

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 0.5rem)',
          right: 0,
          width: '320px',
          maxHeight: '420px',
          overflowY: 'auto',
          background: 'rgba(18, 10, 28, 0.97)',
          border: '1px solid rgb(var(--purple-rgb) / 0.25)',
          borderRadius: '0.85rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 100,
        }}>
          {/* Header */}
          <div style={{
            padding: '0.9rem 1.1rem 0.7rem',
            borderBottom: '1px solid rgb(var(--gold-rgb) / 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <span style={{ fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--purple)', opacity: 0.85 }}>
              Notifications
            </span>
            {recent.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                style={{
                  border: '1px solid rgba(255,120,120,0.25)',
                  background: 'transparent',
                  color: 'var(--danger)',
                  borderRadius: '9999px',
                  padding: '0.15rem 0.6rem',
                  fontSize: '0.62rem',
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  opacity: 0.8,
                }}
              >
                Clear all
              </button>
            )}
          </div>

          {/* List */}
          {recent.length === 0 ? (
            <p style={{ padding: '1.25rem 1.1rem', fontSize: '0.85rem', opacity: 0.4, fontStyle: 'italic', margin: 0 }}>
              No notifications yet
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recent.map((n, i) => {
                const isUnread = !n.read_at
                const when = new Date(n.created_at).toLocaleString('en-CA', {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })

                const link: { href: string; label: string } | null = (() => {
                  // Dues report → jump straight to the member's Camp Dues section.
                  if (n.event_type === 'dues_reported' && n.application_id) return { href: `/admin/${n.application_id}#dues`, label: 'Confirm payment →' }
                  if (n.application_id) return { href: `/admin/${n.application_id}`, label: 'View application →' }
                  if (n.event_type === 'volunteer_signup' && n.details?.volunteer_id) return { href: `/admin#volunteer-${n.details.volunteer_id}`, label: 'View volunteer →' }
                  if (n.event_type === 'volunteer_signup') return { href: '/admin', label: 'View volunteers →' }
                  if (n.event_type === 'role_suggestion') return { href: '/admin', label: 'Review suggestion →' }
                  return null
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
                          <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--purple)', marginRight: '6px', verticalAlign: 'middle', flexShrink: 0 }} />
                        )}
                        {n.message}
                      </p>
                      <span style={{ fontSize: '0.68rem', opacity: 0.35, flexShrink: 0, whiteSpace: 'nowrap' }}>{when}</span>
                    </div>
                    {n.event_type === 'attendance_cancelled' && n.details?.reason && (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.77rem', opacity: 0.5, fontStyle: 'italic' }}>
                        "{n.details.reason}"
                      </p>
                    )}
                    {n.event_type === 'attendance_suspended' && n.details?.note && (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.77rem', opacity: 0.5, fontStyle: 'italic' }}>
                        "{n.details.note}"
                      </p>
                    )}
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

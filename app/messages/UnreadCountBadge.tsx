'use client'

import { useUnreadMessages } from '@/components/MessagesNavLink'

export function UnreadCountBadge() {
  // Shares the module-level poller in MessagesNavLink — this component used to
  // run its own identical 30s poll, doubling the sustained request rate on
  // /messages.
  const unread = useUnreadMessages()

  if (unread <= 0) return null

  return (
    <span
      aria-label={`${unread} unread`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '1.5rem',
        height: '1.5rem',
        padding: '0 0.5rem',
        marginLeft: '0.75rem',
        borderRadius: '9999px',
        background: 'var(--purple)',
        color: '#fff',
        fontSize: '0.8rem',
        fontWeight: 700,
        fontFamily: 'system-ui, sans-serif',
        lineHeight: 1,
        verticalAlign: 'middle',
        boxShadow: '0 0 12px rgb(var(--purple-rgb) / 0.45)',
      }}
    >
      {unread > 99 ? '99+' : unread}
    </span>
  )
}

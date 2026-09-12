'use client'

import { usePathname } from 'next/navigation'
import { IconImage } from './IconImage'
import { useUnreadMessages } from './MessagesNavLink'

export type TabBarLink = {
  href: string
  label: string
  /** Shorter label for the tab bar when the nav label doesn't fit (e.g. "My Profile" → "Profile"). */
  tabLabel?: string
  icon: string
  badge?: boolean
}

// The member nav, relocated for thumbs: same surfaces, same order, same labels
// as the desktop top nav (one product, one IA — docs/mobile-companion.md).
// Rendered by HeaderClient on small screens for approved members only; public
// visitors keep the hamburger, and /admin keeps the full-width workspace.
export function MobileTabBar({ links }: { links: TabBarLink[] }) {
  const pathname = usePathname()
  const unread = useUnreadMessages()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* The bar is fixed, so give every page room to scroll past it (and keep
          the Footer reachable). Scoped by mount: this style exists only while
          the bar does. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `body { padding-bottom: calc(58px + env(safe-area-inset-bottom, 0px)); }`,
        }}
      />
      <nav
        aria-label="Member navigation"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'stretch',
          // Near-opaque instead of frosted: the bar only exists on phones,
          // where a fixed backdrop-filter re-blurs on every scroll frame.
          backgroundColor: 'rgba(20, 8, 30, 0.97)',
          borderTop: '1px solid rgb(var(--gold-rgb) / 0.25)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {links.map((link) => {
          const active = isActive(link.href)
          const showBadge = Boolean(link.badge) && unread > 0
          return (
            <a
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              aria-label={
                showBadge ? `${link.label} — ${unread} unread` : link.label
              }
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                padding: '8px 2px 7px',
                position: 'relative',
                textDecoration: 'none',
                color: active ? 'var(--gold)' : 'rgb(var(--cream-rgb) / 0.55)',
                transition: 'color 0.2s',
              }}
            >
              {/* Active marker: the desktop underline's gradient + glow dot,
                  moved to the tab's top edge. */}
              {active && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: '-1px',
                    left: '18%',
                    width: '64%',
                    height: '1px',
                    background:
                      'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.8), transparent)',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: 'var(--gold)',
                      boxShadow: '0 0 6px rgb(var(--gold-rgb) / 0.9)',
                    }}
                  />
                </span>
              )}
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <IconImage src={link.icon} size={26} opacity={active ? 1 : 0.55} />
                {showBadge && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-8px',
                      minWidth: '15px',
                      height: '15px',
                      borderRadius: '9999px',
                      background: 'var(--purple)',
                      color: '#fff',
                      fontSize: '0.56rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
                      lineHeight: 1,
                      boxShadow: '0 0 8px rgb(var(--purple-rgb) / 0.5)',
                    }}
                  >
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
              <span
                style={{
                  fontSize: '0.58rem',
                  letterSpacing: '0.07em',
                  whiteSpace: 'nowrap',
                }}
              >
                {link.tabLabel ?? link.label}
              </span>
            </a>
          )
        })}
      </nav>
    </>
  )
}

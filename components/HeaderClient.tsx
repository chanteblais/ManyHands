'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth, useUser } from '@clerk/nextjs'
import { supabaseResizedUrl } from '@/lib/supabase-image'
import dynamicImport from 'next/dynamic'
import { UserNotificationBell } from './UserNotificationBell'

// Admin-only: a static client→client import would bundle the admin bell into
// every visitor's header chunk — load it only when an admin actually renders.
const NotificationBell = dynamicImport(
  () => import('@/app/admin/NotificationBell').then(m => m.NotificationBell),
  { ssr: false },
)
import { MessagesNavLink } from './MessagesNavLink'
import { MobileTabBar, type TabBarLink } from './MobileTabBar'

const AUTH_MEMORY_KEY = 'glaum-auth-signed-in'
const AUTH_NAME_KEY = 'glaum-auth-first-name'
const AUTH_EMAIL_KEY = 'glaum-auth-email'

export type NavAuthState = {
  isSignedIn: boolean
  isApproved?: boolean
  firstName?: string | null
  email?: string | null
  avatarUrl?: string | null
  // Admin of the current community (members.role) — server-resolved; the
  // client never reads Clerk publicMetadata for this (branch 1d).
  isAdmin?: boolean
}

const publicNavLinks = [
  { href: '/about', label: 'About' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/apply', label: 'Apply' },
]

// One list drives both renderings of the member nav: labels across the top on
// desktop, icon tabs along the bottom on phones (same surfaces, same order —
// docs/mobile-companion.md, "one product, one IA").
const memberNavLinks: TabBarLink[] = [
  { href: '/schedule', label: 'Schedule', icon: '/asset-library/icons/gathering.webp' },
  { href: '/radio', label: 'Radio', icon: '/asset-library/icons/vintage-radio.webp' },
  { href: '/members', label: 'Many Hands', icon: '/asset-library/icons/raised-hand.webp' },
  { href: '/messages', label: 'Messages', badge: true, icon: '/asset-library/icons/envelope.webp' },
  { href: '/participate', label: 'Participate', icon: '/asset-library/icons/signpost.webp' },
  { href: '/profile', label: 'My Profile', tabLabel: 'Profile', icon: '/asset-library/icons/hand-mirror.webp' },
]

// `initialAuth` comes from the server Header (auth() + member row at render
// time), so the very first paint already shows the right nav — the Clerk
// client state, /api/nav-auth fetch, and localStorage fallbacks below only
// matter when it's absent.
export function HeaderClient({ initialAuth }: { initialAuth?: NavAuthState }) {
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const pathname = usePathname()
  // Active when the path is the link itself or one of its sub-routes
  // (e.g. /messages/g/123 keeps "Messages" lit). No nav link is '/', so
  // the startsWith check can't over-match the home route.
  const isActiveLink = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')
  const [mounted, setMounted] = useState(false)
  const [serverAuth, setServerAuth] = useState<NavAuthState | null>(initialAuth ?? null)
  const [authChecked, setAuthChecked] = useState(false)
  const [hasRememberedAuth, setHasRememberedAuth] = useState(false)
  const [rememberedFirstName, setRememberedFirstName] = useState<string | null>(null)
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const reconciledRef = useRef(false)

  // serverAuth is render-time truth (present from the first SSR paint when the
  // server passed it), so it isn't gated on `mounted` — that gate is what used
  // to flash the signed-out nav for a beat on every page load.
  const signedIn = Boolean(serverAuth?.isSignedIn) || (mounted && (Boolean(isSignedIn) || hasRememberedAuth))
  const isApproved = Boolean(serverAuth?.isApproved)
  const userFirstName = user?.firstName ?? serverAuth?.firstName ?? rememberedFirstName
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? serverAuth?.email ?? rememberedEmail
  const avatarUrl = serverAuth?.avatarUrl ?? null
  const initials = userFirstName?.[0] ?? '✦'
  const isAdmin = Boolean(serverAuth?.isAdmin)
  const activeNavLinks = signedIn && isApproved ? memberNavLinks : publicNavLinks
  // On phones, approved members get the bottom tab bar instead of page links
  // in the hamburger — the menu shrinks to overflow (name, About, Admin, sign
  // out). Public visitors keep the full hamburger, and /admin keeps the plain
  // header: admin is a web/desktop workspace (docs/mobile-companion.md).
  const tabBarActive = isMobile && signedIn && isApproved && !pathname.startsWith('/admin')

  useEffect(() => {
    setMounted(true)

    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)

    const params = new URLSearchParams(window.location.search)
    if (params.get('signed_in') === '1') {
      window.localStorage.setItem(AUTH_MEMORY_KEY, 'true')
      params.delete('signed_in')
      const nextSearch = params.toString()
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      )
    }

    setHasRememberedAuth(window.localStorage.getItem(AUTH_MEMORY_KEY) === 'true')
    setRememberedFirstName(window.localStorage.getItem(AUTH_NAME_KEY))
    setRememberedEmail(window.localStorage.getItem(AUTH_EMAIL_KEY))

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (!mounted) return

    const firstName = user?.firstName ?? serverAuth?.firstName
    const email = user?.primaryEmailAddress?.emailAddress ?? serverAuth?.email

    if (firstName) {
      window.localStorage.setItem(AUTH_NAME_KEY, firstName)
      setRememberedFirstName(firstName)
    }

    if (email) {
      window.localStorage.setItem(AUTH_EMAIL_KEY, email)
      setRememberedEmail(email)
    }
  }, [mounted, user?.firstName, user?.primaryEmailAddress?.emailAddress, serverAuth?.firstName, serverAuth?.email])

  useEffect(() => {
    if (!mounted) return

    // The server already resolved auth for this page render — no need to ask
    // /api/nav-auth again; just keep the localStorage memory in sync.
    if (initialAuth) {
      setAuthChecked(true)
      if (initialAuth.isSignedIn) {
        window.localStorage.setItem(AUTH_MEMORY_KEY, 'true')
        setHasRememberedAuth(true)
      } else {
        window.localStorage.removeItem(AUTH_MEMORY_KEY)
        window.localStorage.removeItem(AUTH_NAME_KEY)
        window.localStorage.removeItem(AUTH_EMAIL_KEY)
        setHasRememberedAuth(false)
        setRememberedFirstName(null)
        setRememberedEmail(null)
      }
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const checkAuth = (attempt = 0) => {
      fetch('/api/nav-auth', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: NavAuthState | null) => {
          if (cancelled) return

          if (data?.isSignedIn || attempt >= 3) {
            setServerAuth(data)
            setAuthChecked(true)
            if (data?.isSignedIn) {
              window.localStorage.setItem(AUTH_MEMORY_KEY, 'true')
              setHasRememberedAuth(true)
            } else {
              window.localStorage.removeItem(AUTH_MEMORY_KEY)
              window.localStorage.removeItem(AUTH_NAME_KEY)
              window.localStorage.removeItem(AUTH_EMAIL_KEY)
              setHasRememberedAuth(false)
              setRememberedFirstName(null)
              setRememberedEmail(null)
            }
            return
          }

          timeoutId = setTimeout(() => checkAuth(attempt + 1), 350)
        })
        .catch(() => {
          if (!cancelled) {
            setServerAuth(null)
            setAuthChecked(true)
          }
        })
    }

    checkAuth()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  // Self-heal a signed-in-but-public nav. When the server passed `initialAuth`
  // the effect above trusts it and never polls /api/nav-auth — so if that render
  // resolved signed-out or not-approved (a transient SSR auth hiccup, or on
  // localhost the dev-instance clerk_user_id split where the email fallback can
  // miss) while the client Clerk session is valid, the nav is stuck on the public
  // links until a manual refresh. Once Clerk confirms we're signed in and the
  // server state doesn't already show an approved member, re-poll once to
  // reconcile — the nav corrects itself in a beat instead of needing a reload.
  useEffect(() => {
    if (!mounted || !isLoaded || !initialAuth) return
    if (!isSignedIn) return // client agrees we're signed out → public nav is right
    if (serverAuth?.isSignedIn && serverAuth?.isApproved) return // already correct
    if (reconciledRef.current) return
    reconciledRef.current = true

    fetch('/api/nav-auth', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: NavAuthState | null) => {
        if (data?.isSignedIn) {
          setServerAuth(data)
          if (data.isApproved) {
            window.localStorage.setItem(AUTH_MEMORY_KEY, 'true')
            setHasRememberedAuth(true)
          }
        }
      })
      .catch(() => {})
  }, [mounted, isLoaded, isSignedIn, initialAuth, serverAuth?.isSignedIn, serverAuth?.isApproved])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Instantly reflect a new avatar upload without waiting for next nav-auth poll
  useEffect(() => {
    function handleAvatarUpdate(e: Event) {
      const url = (e as CustomEvent).detail?.avatarUrl
      if (url) setServerAuth((prev) => prev ? { ...prev, avatarUrl: url } : prev)
    }
    window.addEventListener('glaum:avatar-updated', handleAvatarUpdate)
    return () => window.removeEventListener('glaum:avatar-updated', handleAvatarUpdate)
  }, [])

  const authSlot = signedIn ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        style={{
          width: '34px',
          height: '34px',
          borderRadius: '50%',
          background: 'rgb(var(--gold-rgb) / 0.15)',
          border: '1px solid rgb(var(--gold-rgb) / 0.4)',
          color: 'var(--gold)',
          fontSize: '0.85rem',
          fontFamily: 'var(--font-display)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.2s, border-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgb(var(--gold-rgb) / 0.25)'
          e.currentTarget.style.borderColor = 'rgb(var(--gold-rgb) / 0.7)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgb(var(--gold-rgb) / 0.15)'
          e.currentTarget.style.borderColor = 'rgb(var(--gold-rgb) / 0.4)'
        }}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={dropdownOpen}
      >
        {avatarUrl ? (
          <img
            src={supabaseResizedUrl(avatarUrl, 68) ?? avatarUrl}
            alt={userFirstName ?? 'Profile'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
          />
        ) : initials}
      </button>

      {dropdownOpen && (
        <div
          role="menu"
          aria-label="Account menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 0.5rem)',
            backgroundColor: 'rgba(22, 8, 32, 0.98)',
            border: '1px solid rgb(var(--gold-rgb) / 0.2)',
            borderRadius: '0.75rem',
            padding: '0.5rem 0',
            minWidth: '160px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(16px)',
          }}
        >
          {userFirstName && (
            <div style={{ padding: '0.5rem 1rem 0.75rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.1)', marginBottom: '0.25rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--gold)', opacity: 0.9, margin: 0 }}>{userFirstName}</p>
              {userEmail && <p style={{ fontSize: '0.7rem', color: 'var(--cream)', opacity: 0.4, margin: 0 }}>{userEmail}</p>}
            </div>
          )}
          {[
            { href: '/about', label: 'About Glåüm' },
            ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setDropdownOpen(false)}
              style={{
                display: 'block',
                padding: '0.5rem 1rem',
                fontSize: '0.8rem',
                letterSpacing: '0.06em',
                color: 'var(--cream)',
                textDecoration: 'none',
                opacity: 0.7,
                transition: 'opacity 0.15s, color 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.color = 'var(--gold)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.7'
                e.currentTarget.style.color = 'var(--cream)'
              }}
            >
              {label}
            </Link>
          ))}
          <div style={{ height: '1px', background: 'rgb(var(--gold-rgb) / 0.1)', margin: '0.25rem 0' }} role="separator" />
          <a
            href="/api/sign-out"
            role="menuitem"
            onClick={() => {
              window.localStorage.removeItem(AUTH_MEMORY_KEY)
              window.localStorage.removeItem(AUTH_NAME_KEY)
              window.localStorage.removeItem(AUTH_EMAIL_KEY)
              setHasRememberedAuth(false)
              setRememberedFirstName(null)
              setRememberedEmail(null)
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '0.5rem 1rem',
              fontSize: '0.8rem',
              letterSpacing: '0.06em',
              color: 'var(--cream)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              opacity: 0.4,
              textDecoration: 'none',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4' }}
          >
            Sign out
          </a>
        </div>
      )}
    </div>
    </div>
  ) : (
    <Link
      href="/sign-in"
      style={{
        fontSize: '0.75rem',
        letterSpacing: '0.12em',
        color: 'var(--cream)',
        textDecoration: 'none',
        opacity: 0.5,
      }}
    >
      Sign in
    </Link>
  )

  const mobileMenuLink: React.CSSProperties = {
    color: 'var(--cream)',
    textDecoration: 'none',
    fontSize: '1rem',
    letterSpacing: '0.08em',
    padding: '0.75rem 0',
    borderBottom: '1px solid rgb(var(--gold-rgb) / 0.08)',
    display: 'block',
  }

  return (
    <>
    <header
      role="banner"
      className="glass-bar"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        borderBottom: '1px solid rgb(var(--gold-rgb) / 0.2)',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '64px',
          gap: '1rem',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          aria-label="Glåüm Camp home"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.4rem',
            color: 'var(--gold)',
            textDecoration: 'none',
            letterSpacing: '0.05em',
            textShadow: '0 0 20px rgb(var(--purple-rgb) / 0.6)',
            flexShrink: 0,
          }}
        >
          Glåüm
          <span style={{ color: 'var(--cream)', fontSize: '0.65rem', letterSpacing: '0.15em', marginLeft: '0.5rem', fontFamily: 'var(--font-libre-baskerville)', opacity: 0.6 }}>
            sponsored by Shrimp™
          </span>
        </Link>

        {/* Desktop nav */}
        {!isMobile && (
          <nav aria-label="Primary" style={{ display: 'flex', gap: '2rem', flex: 1, justifyContent: 'center' }}>
            {activeNavLinks.map((link) => {
              const active = isActiveLink(link.href)
              const linkStyle: React.CSSProperties = active
                ? { color: 'var(--gold)', textDecoration: 'none', fontSize: '0.85rem', letterSpacing: '0.08em', opacity: 1, transition: 'opacity 0.2s, color 0.2s' }
                : { color: 'var(--cream)', textDecoration: 'none', fontSize: '0.85rem', letterSpacing: '0.08em', opacity: 0.8, transition: 'opacity 0.2s, color 0.2s' }
              return (
                <span key={link.href} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  {'badge' in link && link.badge ? (
                    <MessagesNavLink style={linkStyle} />
                  ) : (
                    <a
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      style={linkStyle}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--gold)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = active ? '1' : '0.8'; e.currentTarget.style.color = active ? 'var(--gold)' : 'var(--cream)' }}
                    >
                      {link.label}
                    </a>
                  )}
                  {active && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: '50%',
                        bottom: '-12px',
                        transform: 'translateX(-50%)',
                        width: '100%',
                        height: '1px',
                        background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.7), transparent)',
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
                </span>
              )
            })}
          </nav>
        )}

        {/* Notification bell — rendered ONCE outside the isMobile branches so
            the false→true flip on mobile doesn't unmount/remount it (each
            mount fires the notifications fetch; the old two-slot layout
            fetched twice on every mobile load). marginLeft:auto right-aligns
            it when the desktop nav (flex:1) is absent; -0.5rem cancels half
            the row gap to keep the original 0.5rem spacing to its neighbor. */}
        {signedIn && (
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: 'auto', marginRight: '-0.5rem' }}>
            {isAdmin ? <NotificationBell /> : <UserNotificationBell />}
          </div>
        )}

        {/* Desktop auth slot */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
            {authSlot}
          </div>
        )}

        {/* Mobile right side: hamburger */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav-menu"
            >
              {menuOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Mobile menu */}
      {isMobile && menuOpen && (
        <nav
          id="mobile-nav-menu"
          aria-label="Mobile"
          style={{
            backgroundColor: 'rgba(20, 8, 30, 0.98)',
            borderTop: '1px solid rgb(var(--gold-rgb) / 0.15)',
            padding: '0.75rem 1.25rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {signedIn && (userFirstName || userEmail) && (
            <div style={{ padding: '0.75rem 0 1rem', marginBottom: '0.25rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.15)' }}>
              {userFirstName && <p style={{ fontSize: '0.85rem', color: 'var(--gold)', opacity: 0.9, margin: 0 }}>{userFirstName}</p>}
              {userEmail && <p style={{ fontSize: '0.72rem', color: 'var(--cream)', opacity: 0.35, margin: '0.2rem 0 0' }}>{userEmail}</p>}
            </div>
          )}

          {!tabBarActive && activeNavLinks.map((link) => {
            const active = isActiveLink(link.href)
            // Lit gold + a left accent bar marks the current page in the mobile menu.
            const itemStyle: React.CSSProperties = active
              ? { ...mobileMenuLink, color: 'var(--gold)', paddingLeft: '0.75rem', borderLeft: '2px solid var(--gold)' }
              : mobileMenuLink
            return 'badge' in link && link.badge ? (
              <MessagesNavLink
                key={link.href}
                style={{ ...itemStyle, display: 'flex', alignItems: 'center' }}
              />
            ) : (
              <a key={link.href} href={link.href} aria-current={active ? 'page' : undefined} onClick={() => setMenuOpen(false)} style={itemStyle}>
                {link.label}
              </a>
            )
          })}

          {signedIn && (
            <>
              <a href="/#about" onClick={() => setMenuOpen(false)} style={{ ...mobileMenuLink, opacity: 0.6 }}>
                About
              </a>
              {isAdmin && (
                <Link href="/admin" onClick={() => setMenuOpen(false)} style={{ ...mobileMenuLink, color: 'var(--gold)', opacity: 0.7 }}>
                  Admin
                </Link>
              )}
              <a
                href="/api/sign-out"
                onClick={() => {
                  window.localStorage.removeItem(AUTH_MEMORY_KEY)
                  window.localStorage.removeItem(AUTH_NAME_KEY)
                  window.localStorage.removeItem(AUTH_EMAIL_KEY)
                  setHasRememberedAuth(false)
                  setRememberedFirstName(null)
                  setRememberedEmail(null)
                }}
                style={{ ...mobileMenuLink, opacity: 0.4, borderBottom: 'none' }}
              >
                Sign out
              </a>
            </>
          )}

          {!signedIn && (
            <Link href="/sign-in" onClick={() => setMenuOpen(false)} style={{ ...mobileMenuLink, opacity: 0.6, borderBottom: 'none' }}>
              Sign in
            </Link>
          )}
        </nav>
      )}
    </header>
    {tabBarActive && <MobileTabBar links={memberNavLinks} />}
    </>
  )
}

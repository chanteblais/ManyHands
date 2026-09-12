'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useCommunity } from '@/components/CommunityProvider'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'glaum-install-dismissed'

const INK = 'var(--ink)'
const GOLD = 'var(--gold)'
const CREAM = 'var(--cream)'

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

// A dismissible nudge to install the PWA — shown ONLY on platforms with a true
// one-tap install (Android/desktop Chrome fire `beforeinstallprompt`). We
// deliberately do NOT prompt on iOS: Apple restricts home-screen install to a
// manual Safari-only flow that's too clunky to push on members, so reach there
// is handled by email instead. Hidden once installed or dismissed.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const pathname = usePathname()
  const { name: siteName } = useCommunity()

  useEffect(() => {
    if (isStandalone()) return
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY)) return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  // Not in the admin console: the nudge is for members, and as a fixed overlay
  // it sits on top of the console's bottom rows of controls.
  if (pathname?.startsWith('/admin')) return null

  if (!show || !deferred) return null

  const dismiss = () => {
    setShow(false)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  const install = async () => {
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    dismiss()
  }

  return (
    <div
      role="dialog"
      aria-label={`Install ${siteName}`}
      style={{
        position: 'fixed',
        left: '0.75rem',
        right: '0.75rem',
        bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
        zIndex: 9999,
        margin: '0 auto',
        maxWidth: 480,
        background: INK,
        border: `1px solid ${GOLD}`,
        borderRadius: 14,
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
        padding: '0.9rem 1rem',
        color: CREAM,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        fontFamily: 'var(--font-libre-baskerville), Georgia, serif',
      }}
    >
      <img
        src="/favicon/android-chrome-192x192.png"
        alt=""
        width={40}
        height={40}
        style={{ borderRadius: 8, flex: '0 0 auto' }}
      />
      <div style={{ flex: '1 1 auto', minWidth: 0, fontSize: '0.85rem', lineHeight: 1.4 }}>
        <span>
          Install <strong style={{ color: GOLD }}>{siteName}</strong> for quick access and a
          full-screen experience.
        </span>
      </div>
      <button
        onClick={install}
        style={{
          flex: '0 0 auto',
          background: GOLD,
          color: INK,
          border: 'none',
          borderRadius: 8,
          padding: '0.45rem 0.85rem',
          fontWeight: 700,
          fontSize: '0.85rem',
          cursor: 'pointer',
        }}
      >
        Install
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          flex: '0 0 auto',
          background: 'transparent',
          color: CREAM,
          border: 'none',
          fontSize: '1.25rem',
          lineHeight: 1,
          cursor: 'pointer',
          padding: '0 0.25rem',
        }}
      >
        ×
      </button>
    </div>
  )
}

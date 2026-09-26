'use client'

import { useEffect, useState } from 'react'
import { useAuth, useSignIn } from '@clerk/nextjs'

// Floating card at the foot of every page of a demo community (lib/demo.ts) —
// the header is position:fixed at the top, so the bottom is the free edge
// (lifted above the mobile tab bar).
// Signed out: the one-click way in — mint a throwaway organizer via
// /api/demo/enter, redeem its sign-in ticket, land on the hub. Signed in:
// a dismissible reminder that this is a sandbox.

const DISMISS_KEY = 'demo-banner-dismissed'

const CSS = `
.demo-banner { position: fixed; left: 50%; transform: translateX(-50%); bottom: 16px; z-index: 60;
  width: max-content; max-width: calc(100vw - 32px); box-sizing: border-box; }
@media (max-width: 767px) { .demo-banner { bottom: calc(70px + env(safe-area-inset-bottom, 0px)); } }
`
export default function DemoBanner({ communityName }: { communityName: string }) {
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try { setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1') } catch {}
  }, [])

  function dismiss() {
    setDismissed(true)
    try { sessionStorage.setItem(DISMISS_KEY, '1') } catch {}
  }

  async function enter() {
    if (!signInLoaded || !signIn) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/demo/enter', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (body.signedIn) {
        window.location.assign('/')
        return
      }
      if (!res.ok || !body.ticket) throw new Error(body.error || 'Could not open the demo — please try again.')
      const attempt = await signIn.create({ strategy: 'ticket', ticket: body.ticket })
      if (attempt.status !== 'complete' || !attempt.createdSessionId) throw new Error('Sign-in did not complete — please try again.')
      await setActive({ session: attempt.createdSessionId })
      window.location.assign('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the demo — please try again.')
      setBusy(false)
    }
  }

  const signedIn = authLoaded && isSignedIn
  if (signedIn && dismissed) return null

  return (
    <div
      role="note"
      className="demo-banner"
      style={{
        background: 'var(--ink)',
        border: '1px solid rgb(var(--gold-rgb) / 0.45)',
        borderRadius: '14px',
        boxShadow: '0 10px 30px rgb(0 0 0 / 0.45)',
        color: 'var(--cream)',
        fontSize: '0.85rem',
        lineHeight: 1.45,
        padding: '0.65rem 1rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem 1rem',
        textAlign: 'center',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {signedIn ? (
        <>
          <span>
            <strong style={{ color: 'var(--gold)' }}>{communityName} is a demo.</strong>{' '}
            Change anything you like — no emails go out, and it all resets overnight.
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Hide demo notice"
            style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: '1.1rem', lineHeight: 1, cursor: 'pointer', padding: '0 0.25rem' }}
          >
            ×
          </button>
        </>
      ) : (
        <>
          <span>
            <strong style={{ color: 'var(--gold)' }}>{communityName} is a demo community.</strong>{' '}
            Step inside as an organizer — no account needed.
          </span>
          <button
            type="button"
            onClick={enter}
            disabled={busy || !authLoaded || !signInLoaded}
            style={{
              background: 'var(--gold)',
              color: 'var(--gold-dark)',
              border: 'none',
              borderRadius: '999px',
              padding: '0.35rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Opening…' : 'Explore as an organizer →'}
          </button>
          {error && <span style={{ color: 'var(--danger)', width: '100%' }}>{error}</span>}
        </>
      )}
    </div>
  )
}

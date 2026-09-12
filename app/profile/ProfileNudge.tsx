'use client'

import { useEffect, useState } from 'react'

// A gentle, dismissible profile-completion nudge shown at the TOP of the profile
// (visible, not buried in the Profile Details card lower down). Two-tier dismissal:
//   • "Not now"        — snooze for this browser session only (sessionStorage); the
//                        nudge returns on the member's next visit. Nothing persisted.
//   • "Don't ask again"— persist the optional gaps into member_profiles.__dismissedFields
//                        (via the same PATCH the catch-up flow uses) so they never re-prompt.
// Gaps are computed server-side (app/profile/page.tsx via profileGaps) and passed in,
// so there's no second fetch and no loading flash. Required gaps can't be permanently
// dismissed (only snoozed), matching the registry rule.

const GOLD = 'var(--gold)'
const PURPLE = 'var(--purple)'
const CREAM = 'var(--cream)'
const INK = 'var(--ink)'

const SNOOZE_KEY = 'glaum-profile-nudge-snoozed'

type Gap = { key: string; label: string; required: boolean }

export function ProfileNudge({ gaps }: { gaps: Gap[] }) {
  // Client-only: visibility depends on sessionStorage, so render nothing until
  // mounted (avoids an SSR/hydration mismatch and a flash-then-hide for snoozers).
  const [mounted, setMounted] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    setMounted(true)
    try { if (sessionStorage.getItem(SNOOZE_KEY) === '1') setHidden(true) } catch { /* private mode */ }
  }, [])

  if (!mounted || hidden || gaps.length === 0) return null

  const optional = gaps.filter(g => !g.required)
  const labels = gaps.map(g => g.label)
  const summary =
    labels.length === 1 ? labels[0]
    : labels.length === 2 ? `${labels[0]} and ${labels[1]}`
    : `${labels.slice(0, 2).join(', ')}, and ${labels.length - 2} more`

  function notNow() {
    try { sessionStorage.setItem(SNOOZE_KEY, '1') } catch { /* private mode — just hide */ }
    setHidden(true)
  }

  async function dontAskAgain() {
    setDismissing(true)
    try {
      await fetch('/api/profile/fields', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ __dismiss: optional.map(g => g.key) }),
      })
    } catch { /* local hide stands; re-prompts next load if the write failed */ }
    setHidden(true)
  }

  function addNow() {
    const el = document.getElementById('profile-details')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // Nudge the first editable input to focus once the scroll settles.
      const input = el.querySelector<HTMLElement>('textarea, input, select')
      if (input) window.setTimeout(() => input.focus({ preventScroll: true }), 500)
    }
  }

  const textBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '0.78rem', fontFamily: 'inherit', padding: '0.35rem 0.2rem', whiteSpace: 'nowrap',
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .pn-card { display: flex; align-items: center; gap: 1.1rem; }
        .pn-actions { display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
        @media (max-width: 620px) {
          .pn-card { flex-direction: column; align-items: flex-start; gap: 0.9rem; }
          .pn-actions { width: 100%; justify-content: flex-start; }
        }
      ` }} />
      <div
        className="pn-card"
        style={{
          marginBottom: '1.75rem',
          padding: '1.1rem 1.4rem',
          borderRadius: '0.9rem',
          border: '1px solid rgb(var(--purple-rgb) / 0.35)',
          background: 'linear-gradient(100deg, rgb(var(--purple-rgb) / 0.08), rgb(var(--gold-rgb) / 0.06))',
          boxShadow: '0 0 26px rgb(var(--purple-rgb) / 0.10)',
        }}
      >
        <span aria-hidden style={{ color: PURPLE, fontSize: '1.4rem', lineHeight: 1, flexShrink: 0 }}>✦</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: '0 0 0.2rem', fontFamily: 'var(--font-display)', fontSize: '1.02rem', color: GOLD, letterSpacing: '0.02em' }}>
            {gaps.length === 1 ? 'One more detail would round out your profile' : `${gaps.length} details would round out your profile`}
          </p>
          <p style={{ margin: 0, fontSize: '0.82rem', color: CREAM, opacity: 0.7, lineHeight: 1.5 }}>
            {summary}{optional.length === gaps.length ? ' — all optional.' : '.'}
          </p>
        </div>

        <div className="pn-actions">
          <button
            onClick={addNow}
            style={{
              padding: '0.5rem 1.15rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
              background: GOLD, color: INK, fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
              letterSpacing: '0.03em', whiteSpace: 'nowrap',
            }}
          >
            Add now →
          </button>
          <button onClick={notNow} style={{ ...textBtn, color: CREAM, opacity: 0.6 }}>Not now</button>
          {optional.length > 0 && (
            <button onClick={dontAskAgain} disabled={dismissing} style={{ ...textBtn, color: CREAM, opacity: 0.38, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
              {dismissing ? 'Dismissing…' : 'Don’t ask again'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

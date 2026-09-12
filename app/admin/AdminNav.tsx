'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { AdminCategory } from './admin-sections'

const GOLD = 'var(--gold)'
const PURPLE = 'var(--purple)'
const CREAM = 'var(--cream)'

const TABS = [
  { label: 'Overview', href: '/admin/overview' },
  { label: 'Community', href: '/admin' },
  { label: 'Program', href: '/admin/program' },
  { label: 'Configure', href: '/admin/configure' },
]

export type RunwayProps = {
  daysToCamp: number | null
  milestones: { label: string; dateLabel: string; href: string }[]
}

/**
 * Sticky admin navigation shown on every admin page (incl. nested ones like
 * /admin/configure and /admin/[id]) so the nav never disappears and you can
 * always jump between areas or back to camp without backtracking.
 *
 * Pass `sections` (on the Community, Program, or Configure page) to surface a second row of
 * jump-links down to each category on that page. Pass `runway` to show the
 * days-to-camp strip with the next dated milestones (docs/admin-ux-handoff.md A2).
 */
export function AdminNav({ sections, runway }: { sections?: AdminCategory[]; runway?: RunwayProps }) {
  const path = usePathname()

  // /admin/[id] (application detail) belongs under Community.
  const activeHref =
    path === '/admin/overview' ? '/admin/overview'
    : path.startsWith('/admin/configure') ? '/admin/configure'
    : path.startsWith('/admin/program') ? '/admin/program'
    : '/admin'

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        marginBottom: '2.5rem',
        background: 'rgb(var(--ink-rgb) / 0.88)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid rgb(var(--gold-rgb) / 0.12)',
        // bleed to the full viewport width even inside a max-width column
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
        paddingLeft: 'calc(50vw - 50%)',
        paddingRight: 'calc(50vw - 50%)',
      }}
    >
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0.65rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <Link
            href="/"
            style={{ fontSize: '0.75rem', letterSpacing: '0.1em', color: GOLD, textDecoration: 'none', opacity: 0.6, whiteSpace: 'nowrap' }}
          >
            ← Camp
          </Link>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {TABS.map(t => {
              const active = activeHref === t.href
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  style={{
                    padding: '0.4rem 1.1rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    letterSpacing: '0.1em',
                    textDecoration: 'none',
                    transition: 'all 0.15s',
                    border: active ? `1px solid rgb(var(--purple-rgb) / 0.5)` : '1px solid rgb(var(--gold-rgb) / 0.2)',
                    color: active ? PURPLE : CREAM,
                    background: active ? 'rgb(var(--purple-rgb) / 0.08)' : 'transparent',
                    opacity: active ? 1 : 0.55,
                  }}
                >
                  {t.label}
                </Link>
              )
            })}
          </div>

          <span style={{ fontSize: '0.7rem', letterSpacing: '0.15em', color: PURPLE, opacity: 0.6, whiteSpace: 'nowrap' }}>
            ADMIN
          </span>
        </div>

        {sections && sections.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem 1rem',
              justifyContent: 'center',
              marginTop: '0.6rem',
              paddingTop: '0.55rem',
              borderTop: '1px solid rgb(var(--gold-rgb) / 0.08)',
            }}
          >
            {sections.map(c => (
              <a
                key={c.id}
                href={`#${c.id}`}
                style={{
                  fontSize: '0.68rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: GOLD,
                  opacity: 0.5,
                  textDecoration: 'none',
                }}
              >
                {c.label}
              </a>
            ))}
          </div>
        )}

        {/* Runway strip — days to camp + the next dated milestones (A2). */}
        {runway && (runway.daysToCamp !== null || runway.milestones.length > 0) && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '0.3rem 1.1rem',
              justifyContent: 'center',
              marginTop: '0.55rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid rgb(var(--gold-rgb) / 0.08)',
              fontSize: '0.66rem',
              letterSpacing: '0.06em',
            }}
          >
            {runway.daysToCamp !== null && (
              <span style={{ color: GOLD, opacity: 0.85, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                ✦ {runway.daysToCamp === 0 ? 'Camp is here' : `${runway.daysToCamp} day${runway.daysToCamp === 1 ? '' : 's'} to camp`}
              </span>
            )}
            {runway.milestones.map((m, i) => (
              <a
                key={`${m.label}-${i}`}
                href={m.href}
                style={{ color: CREAM, opacity: 0.45, textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                <span style={{ color: GOLD, opacity: 0.9 }}>·</span>{' '}
                {m.label} — {m.dateLabel}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

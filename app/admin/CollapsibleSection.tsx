'use client'

import { useState, useEffect } from 'react'

export function CollapsibleSection({
  title,
  summary,
  status,
  panel = false,
  defaultOpen,
  children,
}: {
  title: string
  summary?: string
  /** Short live-state note on the right of the header, e.g. "6 fields · 9 system". */
  status?: string
  /** Soft-panel look (Configure): card backdrop, summary always visible, collapsed by default. */
  panel?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  // Panels open collapsed so the page reads as a scannable settings menu;
  // the flat variant keeps its historical open-by-default behavior.
  const [open, setOpen] = useState(defaultOpen ?? !panel)

  // The console remembers how you left each section (keyed by title, per
  // browser). Hydrate after mount so the server render stays deterministic.
  // Panels use their own key space so the collapsed-menu default gets a
  // fresh start on browsers that had the old always-open state saved.
  const storageKey = `${panel ? 'glaum-admin-panel' : 'glaum-admin-section'}:${title}`
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved !== null) setOpen(saved === '1')
    } catch { /* private mode etc. — keep default */ }
  }, [storageKey])

  const toggle = () => {
    setOpen(o => {
      try { localStorage.setItem(storageKey, o ? '0' : '1') } catch { /* ignore */ }
      return !o
    })
  }

  if (panel) {
    return (
      <div style={{
        marginBottom: '1.1rem',
        borderRadius: '0.9rem',
        border: '1px solid rgb(var(--gold-rgb) / 0.14)',
        background: 'rgb(var(--cream-rgb) / 0.03)',
      }}>
        <button
          onClick={toggle}
          aria-expanded={open}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem 1rem',
            background: 'none',
            border: 'none',
            padding: '1.1rem 1.3rem',
            cursor: 'pointer',
            color: 'inherit',
            textAlign: 'left',
          }}
        >
          <span style={{ flex: '1 1 16rem', minWidth: 0 }}>
            {/* Same title scale as the flat variant below — the two admin pages
                (Members flat, Configure panels) read as one family. */}
            <span style={{ display: 'block', fontSize: '0.95rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.85 }}>
              {title}
            </span>
            {summary && (
              <span style={{ display: 'block', marginTop: '0.4rem', fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--cream)', opacity: 0.5 }}>
                {summary}
              </span>
            )}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', whiteSpace: 'nowrap', paddingTop: '0.05rem' }}>
            {status && (
              <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--gold)', opacity: 0.6 }}>{status}</span>
            )}
            <span style={{ fontSize: '0.65rem', color: 'var(--gold)', opacity: 0.45 }}>
              {open ? '▲' : '▼'}
            </span>
          </span>
        </button>
        {open && (
          <div style={{ padding: '1.2rem 1.3rem 1.4rem', borderTop: '1px solid rgb(var(--gold-rgb) / 0.1)' }}>
            {children}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '3rem' }}>
      <button
        onClick={toggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          borderBottom: `1px solid rgb(var(--gold-rgb) / ${open ? '0.2' : '0.1'})`,
          paddingBottom: '0.75rem',
          marginBottom: open ? '1.5rem' : 0,
          cursor: 'pointer',
          color: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '0.95rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.85, flexShrink: 0 }}>
          {title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          {summary && !open && (
            <span style={{ fontSize: '0.75rem', color: 'var(--cream)', opacity: 0.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
          )}
          <span style={{ fontSize: '0.65rem', color: 'var(--gold)', opacity: 0.4 }}>
            {open ? '▲' : '▼'}
          </span>
        </div>
      </button>
      {open && children}
    </div>
  )
}

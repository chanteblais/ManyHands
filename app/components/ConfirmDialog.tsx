'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'

// In-app confirmation in the site's language — replaces the native browser
// confirm() dialog. Use via the useConfirm() hook:
//
//   const { confirm, confirmDialog } = useConfirm()
//   ...
//   if (!(await confirm({ title: 'Delete this group?', danger: true }))) return
//   ...
//   return <div>...{confirmDialog}</div>

export type ConfirmOptions = {
  title: string
  body?: string
  eyebrow?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  // Notice mode: a single acknowledge button instead of a cancel/confirm pair
  // (replaces native alert()). The promise still resolves true.
  notice?: boolean
}

export function useConfirm() {
  const [pending, setPending] = useState<{ opts: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null)

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>(resolve => setPending({ opts, resolve })),
    [],
  )

  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }

  const confirmDialog: ReactNode = pending ? (
    <ConfirmDialog {...pending.opts} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null

  return { confirm, confirmDialog }
}

// Multi-option sibling of useConfirm — "which one?" instead of "are you sure?"
// (first use: recurring schedule events asking all-nights vs just-one-night).
// Resolves the picked option's value, or null on cancel/escape/overlay.
//
//   const { choose, choiceDialog } = useChoice()
//   const picked = await choose({ title: 'Delete which?', choices: [...] })

export type ChoiceOption = {
  value: string
  label: string
  // Small trailing detail line, e.g. a signup count.
  sub?: string
  danger?: boolean
}

export type ChoiceOptions = {
  title: string
  body?: string
  eyebrow?: string
  cancelLabel?: string
  choices: ChoiceOption[]
}

export function useChoice() {
  const [pending, setPending] = useState<{ opts: ChoiceOptions; resolve: (v: string | null) => void } | null>(null)

  const choose = useCallback(
    (opts: ChoiceOptions) => new Promise<string | null>(resolve => setPending({ opts, resolve })),
    [],
  )

  const settle = (v: string | null) => {
    pending?.resolve(v)
    setPending(null)
  }

  const choiceDialog: ReactNode = pending ? (
    <ChoiceDialog {...pending.opts} onPick={v => settle(v)} onCancel={() => settle(null)} />
  ) : null

  return { choose, choiceDialog }
}

export function ChoiceDialog({
  title, body, eyebrow = 'A choice to make', cancelLabel = 'Never mind', choices, onPick, onCancel,
}: ChoiceOptions & {
  onPick: (value: string) => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 60 }} />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 61,
          background: 'var(--ink)', border: '1px solid rgb(var(--gold-rgb) / 0.4)', borderRadius: '1rem',
          padding: '1.6rem 1.75rem', width: '90%', maxWidth: '380px', maxHeight: '82vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgb(var(--gold-rgb) / 0.08)',
        }}
      >
        <p style={{ fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.85, margin: '0 0 0.6rem' }}>
          ✦ {eyebrow}
        </p>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--cream)', margin: 0, lineHeight: 1.3 }}>
          {title}
        </p>
        {body && (
          <p style={{ fontSize: '0.82rem', color: 'var(--cream)', opacity: 0.7, margin: '0.6rem 0 0', lineHeight: 1.5 }}>
            {body}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1.2rem' }}>
          {choices.map(c => (
            <button
              key={c.value}
              onClick={() => onPick(c.value)}
              style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem',
                width: '100%', textAlign: 'left', padding: '0.65rem 0.9rem', borderRadius: '0.65rem',
                cursor: 'pointer', background: c.danger ? 'rgba(255,80,80,0.07)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${c.danger ? 'rgba(255,80,80,0.35)' : 'rgb(var(--gold-rgb) / 0.25)'}`,
              }}
            >
              <span style={{ fontSize: '0.85rem', color: c.danger ? 'var(--danger)' : 'var(--cream)' }}>{c.label}</span>
              {c.sub && <span style={{ fontSize: '0.68rem', color: 'var(--gold)', opacity: 0.7, whiteSpace: 'nowrap', flexShrink: 0 }}>{c.sub}</span>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.2rem' }}>
          <button
            onClick={onCancel}
            style={{ padding: '0.5rem 1.1rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'transparent', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.7 }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </>
  )
}

export function ConfirmDialog({
  title, body, eyebrow, confirmLabel, cancelLabel = 'Never mind', danger = false, notice = false, onConfirm, onCancel,
}: ConfirmOptions & {
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const accentBorder = danger ? 'rgba(255,80,80,0.45)' : 'rgb(var(--gold-rgb) / 0.55)'
  const accentBg = danger ? 'rgba(255,80,80,0.1)' : 'rgb(var(--gold-rgb) / 0.14)'
  const eyebrowText = eyebrow ?? (notice ? 'A small snag' : 'A moment of pause')
  const confirmText = confirmLabel ?? (notice ? 'Understood' : 'Confirm')

  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 60 }} />
      <div
        role="alertdialog"
        aria-modal="true"
        style={{
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 61,
          background: 'var(--ink)', border: '1px solid rgb(var(--gold-rgb) / 0.4)', borderRadius: '1rem',
          padding: '1.6rem 1.75rem', width: '90%', maxWidth: '380px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgb(var(--gold-rgb) / 0.08)',
        }}
      >
        <p style={{ fontSize: '0.65rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.85, margin: '0 0 0.6rem' }}>
          ✦ {eyebrowText}
        </p>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', color: 'var(--cream)', margin: 0, lineHeight: 1.3 }}>
          {title}
        </p>
        {body && (
          <p style={{ fontSize: '0.82rem', color: 'var(--cream)', opacity: 0.7, margin: '0.6rem 0 0', lineHeight: 1.5 }}>
            {body}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.4rem' }}>
          {!notice && (
            <button
              onClick={onCancel}
              style={{ padding: '0.5rem 1.1rem', borderRadius: '9999px', border: '1px solid rgb(var(--gold-rgb) / 0.2)', background: 'transparent', color: 'var(--cream)', cursor: 'pointer', fontSize: '0.8rem', opacity: 0.7 }}
            >
              {cancelLabel}
            </button>
          )}
          <button
            autoFocus
            onClick={onConfirm}
            style={{
              padding: '0.5rem 1.25rem', borderRadius: '9999px', cursor: 'pointer',
              fontSize: '0.8rem', letterSpacing: '0.05em', color: 'var(--cream)',
              border: `1px solid ${accentBorder}`, background: accentBg,
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </>
  )
}

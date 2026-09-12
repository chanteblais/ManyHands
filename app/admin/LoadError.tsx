'use client'

// Shown when a section's initial fetch fails. Distinguishes "the load failed"
// from "there is genuinely nothing here" — without it, a transient error
// renders as a confident empty state ("No events yet") and an admin may
// re-create data that already exists.
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <p style={{ fontSize: '0.85rem', color: 'var(--danger-soft)', opacity: 0.85 }}>
      Couldn&apos;t load this section — it may be a connection hiccup.{' '}
      <button
        type="button"
        onClick={onRetry}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--gold)',
          cursor: 'pointer',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
          fontSize: '0.85rem',
          padding: 0,
        }}
      >
        Retry
      </button>
    </p>
  )
}

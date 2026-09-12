'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: 'Georgia, serif',
      color: 'var(--cream)',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: '0.65rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '1rem', opacity: 0.85 }}>
        ✦ &nbsp;Something went wrong&nbsp; ✦
      </p>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', color: 'var(--gold)', marginBottom: '1.5rem', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
        An error occurred
      </h2>
      <p style={{ fontSize: '0.9rem', opacity: 0.5, marginBottom: '2rem', maxWidth: '400px', lineHeight: 1.7 }}>
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <button
        onClick={reset}
        style={{
          padding: '0.6rem 1.75rem',
          borderRadius: '9999px',
          border: '1px solid rgb(var(--gold-rgb) / 0.5)',
          background: 'transparent',
          color: 'var(--lemon)',
          fontSize: '0.82rem',
          fontFamily: 'var(--font-display)',
          letterSpacing: '0.1em',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}

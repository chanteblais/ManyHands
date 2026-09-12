export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      color: 'var(--cream)',
      textAlign: 'center',
    }}>
      <p style={{ fontSize: '0.65rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '1rem', opacity: 0.85 }}>
        ✦ &nbsp;404&nbsp; ✦
      </p>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', color: 'var(--gold)', marginBottom: '1.5rem', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
        Page not found
      </h2>
      <p style={{ fontSize: '0.9rem', opacity: 0.5, marginBottom: '2rem' }}>
        This page doesn&apos;t exist or has moved.
      </p>
      <a
        href="/"
        style={{
          padding: '0.6rem 1.75rem',
          borderRadius: '9999px',
          border: '1px solid rgb(var(--gold-rgb) / 0.5)',
          color: 'var(--lemon)',
          textDecoration: 'none',
          fontSize: '0.82rem',
          fontFamily: 'var(--font-display)',
          letterSpacing: '0.1em',
        }}
      >
        Back to camp
      </a>
    </div>
  )
}

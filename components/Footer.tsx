export function Footer() {
  return (
    <footer
      style={{
        borderTop: '1px solid rgb(var(--gold-rgb) / 0.2)',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.8rem',
          color: 'var(--gold)',
          textShadow: '0 0 30px rgb(var(--purple-rgb) / 0.4)',
          marginBottom: '0.5rem',
        }}
      >
        Glåüm
      </p>
      <p style={{ fontSize: '0.75rem', opacity: 0.4, letterSpacing: '0.12em', marginBottom: '1.5rem' }}>
        SPONSORED BY SHRIMP™
      </p>
      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.3), transparent)', marginBottom: '1.5rem' }} />
      <p style={{ fontSize: '0.8rem', opacity: 0.4, fontStyle: 'italic' }}>
        What If 2026 · A camp of attunement · Gently satirical, deeply sincere
      </p>
      <p style={{ fontSize: '0.75rem', opacity: 0.3, marginTop: '0.5rem' }}>
        Part of the{' '}
        <a href="https://glaum.ca" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>
          Glåüm collective
        </a>
      </p>
    </footer>
  )
}

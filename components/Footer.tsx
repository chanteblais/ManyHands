import { getCommunity } from '@/lib/community'
import { themeBrand } from '@/lib/theme'

export async function Footer() {
  const community = await getCommunity()
  const brand = themeBrand(community.theme)
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
        {community.name}
      </p>
      {brand.tagline && (
        <p style={{ fontSize: '0.75rem', opacity: 0.4, letterSpacing: '0.12em', marginBottom: '1.5rem', textTransform: 'uppercase' }}>
          {brand.tagline}
        </p>
      )}
      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.3), transparent)', marginBottom: '1.5rem' }} />
      {brand.footerLine && (
        <p style={{ fontSize: '0.8rem', opacity: 0.4, fontStyle: 'italic' }}>
          {brand.footerLine}
        </p>
      )}
      {brand.footerLink && (
        <p style={{ fontSize: '0.75rem', opacity: 0.3, marginTop: '0.5rem' }}>
          Part of the{' '}
          <a href={brand.footerLink.href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>
            {brand.footerLink.label}
          </a>
        </p>
      )}
    </footer>
  )
}

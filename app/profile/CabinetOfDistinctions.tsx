import type { EarnedDistinction } from '@/lib/distinctions'
import { iconDisplaySrc } from '@/components/IconImage'

// Cabinet of Distinctions — a gallery of earned honours rendered as collectible
// engraved medals. These are honours, NOT controls: nothing here is clickable.
// Distinctions are derived from member facts via evaluateDistinctions(); this
// component only renders the result. `compact` renders a smaller, softer-bordered
// variant (used on the public member profile).

function Medal({ d, frame = 88, glyphSize = '2.1rem', labelSize = '0.66rem' }: {
  d: EarnedDistinction
  frame?: number
  glyphSize?: string
  labelSize?: string
}) {
  return (
    <div className="cabinet-medal" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', minWidth: 0 }}>
      {/* Engraved oval frame */}
      <div
        title={d.description ?? d.label}
        style={{
          width: `${frame}px`,
          height: `${frame}px`,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          // Clip the medal art to the circle. Icons are normalized onto a
          // landscape frame (lib/icon-image.ts), so we size them by height and
          // let the transparent sides overflow — overflow:hidden trims that
          // excess to the round edge. (Outer box-shadow is unaffected by clip.)
          overflow: 'hidden',
          background: 'radial-gradient(circle at 38% 30%, rgb(var(--purple-rgb) / 0.16), rgba(8,0,18,0.9) 72%)',
          border: '2px solid var(--gold)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4), inset 0 0 18px rgb(var(--gold-rgb) / 0.18), inset 0 0 0 1px rgba(255,249,232,0.12)',
        }}
      >
        {d.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={iconDisplaySrc(d.image)}
            alt={`${d.label} medal`}
            // Size by height (not objectFit) so the artwork — centered on a
            // landscape normalize frame — fills the medal. width:auto +
            // maxWidth:none lets the transparent sides spill past the frame,
            // where overflow:hidden on the circle clips them. This mirrors the
            // commitment-circle icons, so every current and future medal inherits
            // the same generous, padding-free sizing. Aspect ratio is preserved.
            style={{ height: '132%', width: 'auto', maxWidth: 'none', display: 'block', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }}
          />
        ) : (
          <span style={{ fontSize: glyphSize, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }}>
            {d.glyph ?? '✦'}
          </span>
        )}
      </div>

      {/* Label */}
      <p style={{
        marginTop: '0.35rem',
        fontSize: labelSize,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--parchment)',
        lineHeight: 1.4,
        fontFamily: 'var(--font-cormorant-garamond), serif',
        fontWeight: 600,
      }}>
        {d.label}
      </p>
      {d.engraving && (
        <p style={{
          marginTop: '0.05rem',
          fontSize: '0.62rem',
          letterSpacing: '0.04em',
          color: 'var(--gold)',
          opacity: 0.85,
          fontStyle: 'italic',
          lineHeight: 1.0,
          fontFamily: 'var(--font-cormorant-garamond), serif',
        }}>
          {d.engraving}
        </p>
      )}
      {d.year != null && (
        <p style={{ marginTop: '0.15rem', fontSize: '0.6rem', letterSpacing: '0.14em', color: 'var(--purple)', opacity: 0.8 }}>
          {d.year}
        </p>
      )}
    </div>
  )
}

export function CabinetOfDistinctions({ distinctions, title = 'Cabinet of Distinctions', compact = false }: {
  distinctions: EarnedDistinction[]
  title?: string
  compact?: boolean
}) {
  if (distinctions.length === 0) return null

  const frame = compact ? 92 : 88
  const cell = compact ? 106 : 100
  const cellSm = compact ? 92 : 88

  return (
    <div style={{
      border: compact ? '1px solid rgb(var(--gold-rgb) / 0.28)' : '1.5px solid rgb(var(--gold-rgb) / 0.7)',
      borderRadius: '1rem',
      background: 'rgba(10,0,20,0.6)',
      overflow: 'hidden',
      boxShadow: compact ? '0 0 0 1px rgb(var(--gold-rgb) / 0.06)' : '0 0 0 1px rgb(var(--gold-rgb) / 0.12), 0 0 24px rgb(var(--gold-rgb) / 0.08)',
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .cabinet-grid {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          align-items: flex-start;
          gap: ${compact ? '0.4rem 0.9rem' : '0.5rem 1.25rem'};
          padding: ${compact ? '0.1rem 1.5rem 0.4rem' : '0.1rem 2.5rem 0.5rem'};
        }
        .cabinet-medal { width: ${cell}px; }
        @media (max-width: 600px) {
          .cabinet-grid { gap: 0.5rem 0.75rem; padding: 0.1rem 1.25rem 0.5rem; }
          .cabinet-medal { width: ${cellSm}px; }
        }
      ` }} />

      {/* Header */}
      <div style={{ padding: compact ? '0.55rem 1.25rem 0' : '0.6rem 1.5rem 0.1rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', marginBottom: compact ? '0.1rem' : '0.25rem' }}>
          <span aria-hidden style={{ color: 'var(--gold)', fontSize: '0.72rem', opacity: 0.9 }}>✦</span>
          <span aria-hidden style={{ width: '46px', height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.6))' }} />
          <p style={{ fontFamily: 'var(--font-cormorant-garamond), serif', fontSize: compact ? '1rem' : '1.15rem', fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)', margin: 0, textShadow: '0 0 18px rgb(var(--gold-rgb) / 0.35)', whiteSpace: 'nowrap' }}>
            {title}
          </p>
          <span aria-hidden style={{ width: '46px', height: '1px', background: 'linear-gradient(90deg, rgb(var(--gold-rgb) / 0.6), transparent)' }} />
          <span aria-hidden style={{ color: 'var(--gold)', fontSize: '0.72rem', opacity: 0.9 }}>✦</span>
        </div>
        {!compact && (
          <p style={{ fontSize: '0.82rem', opacity: 0.5, margin: 0, fontStyle: 'italic' }}>
            Earned recognitions and contributions.
          </p>
        )}
      </div>

      {/* Medal gallery */}
      <div className="cabinet-grid">
        {distinctions.map(d => (
          <Medal
            key={d.id}
            d={d}
            frame={frame}
            glyphSize={compact ? '2rem' : '2.1rem'}
            labelSize={compact ? '0.66rem' : '0.66rem'}
          />
        ))}
      </div>
    </div>
  )
}

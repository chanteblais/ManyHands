'use client'

import { HandsBackdrop } from '@/components/HandsBackdrop'
import { DEFAULT_TRACK_COPY, type TrackCopy } from '@/lib/site-config'

export function TrackPicker({ hideMember = false, hideVolunteer = false, copy = DEFAULT_TRACK_COPY }: { hideMember?: boolean; hideVolunteer?: boolean; copy?: TrackCopy }) {
  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      <HandsBackdrop />

      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '3rem 1.5rem 6rem', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
          <a href="/" style={{ fontSize: '0.8rem', letterSpacing: '0.1em', color: 'var(--gold)', textDecoration: 'none', opacity: 0.6 }}>
            ← Back to camp
          </a>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <p style={{ fontSize: '0.65rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '1rem', opacity: 0.85 }}>
            What If 2026
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 6vw, 3rem)', color: 'var(--gold)', lineHeight: 1.1, marginBottom: '0.75rem', textShadow: '0 0 40px rgb(var(--purple-rgb) / 0.4)' }}>
            How would you like to join?
          </h1>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.8, opacity: 0.55, maxWidth: '480px', margin: '0 auto' }}>
            Choose the path that fits you best. You can always reach out if you have questions.
          </p>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @media (max-width: 640px) { .track-picker-grid { grid-template-columns: 1fr !important; } }
        ` }} />
        <div className="track-picker-grid" style={{ display: 'grid', gridTemplateColumns: hideMember || hideVolunteer ? '1fr' : '1fr 1fr', gap: '1.25rem', maxWidth: hideMember || hideVolunteer ? '400px' : undefined, margin: hideMember || hideVolunteer ? '0 auto' : undefined }}>
          {/* Member */}
          {!hideMember && <a href="/apply?track=member" style={{ textDecoration: 'none' }}>
            <div style={{
              padding: '2rem 1.75rem',
              border: '1px solid rgb(var(--gold-rgb) / 0.3)',
              borderRadius: '1rem',
              background: 'rgb(var(--gold-rgb) / 0.04)',
              cursor: 'pointer',
              transition: 'border-color 0.2s, background 0.2s',
              height: '100%',
              boxSizing: 'border-box',
            }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.borderColor = 'rgb(var(--gold-rgb) / 0.65)'
                el.style.background = 'rgb(var(--gold-rgb) / 0.08)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.borderColor = 'rgb(var(--gold-rgb) / 0.3)'
                el.style.background = 'rgb(var(--gold-rgb) / 0.04)'
              }}
            >
              <p style={{ fontSize: '1.6rem', marginBottom: '0.75rem', lineHeight: 1 }}>✦</p>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--gold)', marginBottom: '0.6rem', letterSpacing: '0.05em' }}>
                {copy.memberTitle}
              </p>
              <p style={{ fontSize: '0.85rem', lineHeight: 1.7, opacity: 0.55, margin: 0, whiteSpace: 'pre-wrap' }}>
                {copy.memberDesc}
              </p>
            </div>
          </a>}

          {/* Volunteer */}
          {!hideVolunteer && <a href="/volunteer" style={{ textDecoration: 'none' }}>
            <div style={{
              padding: '2rem 1.75rem',
              border: '1px solid rgb(var(--purple-rgb) / 0.25)',
              borderRadius: '1rem',
              background: 'rgb(var(--purple-rgb) / 0.03)',
              cursor: 'pointer',
              transition: 'border-color 0.2s, background 0.2s',
              height: '100%',
              boxSizing: 'border-box',
            }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.borderColor = 'rgb(var(--purple-rgb) / 0.55)'
                el.style.background = 'rgb(var(--purple-rgb) / 0.08)'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLDivElement
                el.style.borderColor = 'rgb(var(--purple-rgb) / 0.25)'
                el.style.background = 'rgb(var(--purple-rgb) / 0.03)'
              }}
            >
              <p style={{ fontSize: '1.6rem', marginBottom: '0.75rem', lineHeight: 1 }}>🤝</p>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--purple)', marginBottom: '0.6rem', letterSpacing: '0.05em' }}>
                {copy.volunteerTitle}
              </p>
              <p style={{ fontSize: '0.85rem', lineHeight: 1.7, opacity: 0.55, margin: 0, whiteSpace: 'pre-wrap' }}>
                {copy.volunteerDesc}
              </p>
            </div>
          </a>}
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.75rem', opacity: 0.3, marginTop: '2.5rem', letterSpacing: '0.05em' }}>
          Not sure? Reach out to an organiser before applying.
        </p>
      </div>
    </div>
  )
}

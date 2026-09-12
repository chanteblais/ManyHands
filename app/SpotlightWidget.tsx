'use client'

import { useState } from 'react'
import { supabaseResizedUrl } from '@/lib/supabase-image'

export type SpotlightMember = {
  id: string
  preferred_name: string | null
  first_name: string | null
  avatar_url: string | null
  pronouns: string | null
  clerk_user_id: string | null
  find_at_camp?: string | null
  role_name?: string | null
  dept_name?: string | null
}

export function SpotlightWidget({
  pool,
  initialIndex,
}: {
  pool: SpotlightMember[]
  initialIndex: number
}) {
  const [idx, setIdx] = useState(initialIndex)

  if (!pool.length) return null

  const member = pool[idx]
  const total = Math.min(pool.length, 7)
  const windowStart = Math.max(0, Math.min(idx - Math.floor(total / 2), pool.length - total))

  return (
    <div style={{
      position: 'relative',
      padding: '1.5rem',
      border: '1px solid rgb(var(--gold-rgb) / 0.2)',
      borderRadius: '1rem',
      background: 'rgba(10,0,20,0.6)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <p style={{ fontSize: '0.62rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, margin: 0 }}>Meet a Member</p>
      </div>

      <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0, width: '110px', height: '110px', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--bronze)', boxShadow: '0 0 0 1px rgb(var(--gold-rgb) / 0.15)', background: 'rgb(var(--gold-rgb) / 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {member.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={supabaseResizedUrl(member.avatar_url, 220) ?? ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '2rem', opacity: 0.2 }}>✦</span>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: 'var(--gold)', margin: '0 0 0.1rem', lineHeight: 1.2 }}>
            {member.preferred_name || member.first_name || 'Fellow Hand'}
          </p>
          {(member.role_name || member.dept_name) && (
            <div style={{ margin: '0.3rem 0 0.65rem' }}>
              {member.role_name && <p style={{ fontSize: '0.82rem', opacity: 0.65, margin: 0, lineHeight: 1.5 }}>{member.role_name}</p>}
              {member.dept_name && <p style={{ fontSize: '0.78rem', opacity: 0.4, margin: 0, lineHeight: 1.5 }}>{member.dept_name}</p>}
            </div>
          )}
          {member.find_at_camp && (
            <>
              <div style={{ height: '1px', background: 'linear-gradient(90deg, rgb(var(--gold-rgb) / 0.2), transparent)', margin: '0.6rem 0' }} />
              <p style={{ fontSize: '0.72rem', color: 'var(--gold)', opacity: 0.5, margin: '0 0 0.25rem', letterSpacing: '0.06em' }}>Currently exploring</p>
              <p style={{ fontSize: '0.85rem', opacity: 0.7, lineHeight: 1.6, margin: 0 }}>{member.find_at_camp}</p>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {Array.from({ length: total }).map((_, i) => {
            const memberIdx = windowStart + i
            const isActive = memberIdx === idx
            return (
              <button
                key={i}
                onClick={() => setIdx(memberIdx)}
                aria-label={`View member ${memberIdx + 1}`}
                style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  border: '1px solid rgb(var(--gold-rgb) / 0.4)',
                  background: isActive ? 'var(--gold)' : 'transparent',
                  padding: 0, cursor: 'pointer',
                  transition: 'background 0.2s, transform 0.15s',
                  transform: isActive ? 'scale(1.3)' : 'scale(1)',
                }}
              />
            )
          })}
        </div>
        <a href={`/members/${member.clerk_user_id ?? member.id}`} style={{ fontSize: '0.75rem', letterSpacing: '0.1em', color: 'var(--gold)', textDecoration: 'none', opacity: 0.75 }}>
          VIEW PROFILE →
        </a>
      </div>
    </div>
  )
}

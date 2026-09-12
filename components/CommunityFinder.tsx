'use client'

import { useMemo, useState } from 'react'
import type { DirectoryEntry } from '@/lib/community-directory'

// "Find a community": a search box over the public directory. Each card links
// to the community's own site — its apply page when applications are open.

export function CommunityFinder({ communities }: { communities: DirectoryEntry[] }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () => (q ? communities.filter(c => [c.name, c.description ?? '', c.eventName ?? '', c.slug].some(t => t.toLowerCase().includes(q))) : communities),
    [communities, q],
  )

  return (
    <section aria-label="Find a community" style={{ marginTop: '3rem' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--gold)', margin: '0 0 0.5rem' }}>
        Find a community
      </h2>
      <p style={{ margin: '0 0 1rem', opacity: 0.7, lineHeight: 1.6 }}>
        Communities on Many Hands that are open to new people. Search by name, and apply on the community&rsquo;s own page.
      </p>
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search communities…"
        aria-label="Search communities"
        style={{
          width: '100%', padding: '0.8rem 1rem', borderRadius: '10px', fontSize: '1rem',
          background: 'rgb(var(--ink-rgb) / 0.6)', color: 'var(--cream)',
          border: '1px solid rgb(var(--gold-rgb) / 0.35)', outline: 'none', marginBottom: '1rem',
        }}
      />
      {matches.length === 0 ? (
        <p style={{ opacity: 0.6, fontStyle: 'italic' }}>
          {communities.length === 0 ? 'No communities are listed yet.' : 'Nothing matches that search.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
          {matches.map(c => (
            <li key={c.slug}>
              <a
                href={c.applicationsOpen ? `${c.origin}/apply` : `${c.origin}/`}
                style={{
                  display: 'block', padding: '1rem 1.25rem', borderRadius: '12px', textDecoration: 'none', color: 'var(--cream)',
                  border: '1px solid rgb(var(--gold-rgb) / 0.25)', background: 'rgba(255,255,255,0.02)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', color: 'var(--gold)' }}>{c.name}</span>
                  <span
                    style={{
                      fontSize: '0.66rem', letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                      color: c.applicationsOpen ? 'var(--success)' : 'var(--muted)',
                    }}
                  >
                    {c.applicationsOpen ? 'Accepting applications' : 'Applications closed'}
                  </span>
                </div>
                {(c.eventName || c.description) && (
                  <span style={{ display: 'block', fontSize: '0.85rem', opacity: 0.7, marginTop: '0.35rem', lineHeight: 1.5 }}>
                    {[c.eventName, c.description].filter(Boolean).join(' · ')}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

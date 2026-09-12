'use client'

import { useState, useMemo } from 'react'
import { supabaseResizedUrl } from '@/lib/supabase-image'

export type MemberCard = {
  id: string
  dbId: string
  name: string
  avatarUrl: string | null
  roleName: string | null
  deptName: string | null
  roleApprovalStatus: string | null
}

// Outside volunteers — no member profile, so no link target; listed apart.
export type VolunteerCard = {
  dbId: string
  name: string
  avatarUrl: string | null
}

type RoleFilter = 'all' | 'with-role' | 'without-role'

export function MembersGrid({ members, volunteers }: { members: MemberCard[]; volunteers: VolunteerCard[] }) {
  const [query, setQuery] = useState('')
  const [deptFilter, setDeptFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')

  // Distinct departments among members whose role is approved (visible)
  const departments = useMemo(() => {
    const set = new Set<string>()
    members.forEach(m => {
      if (m.deptName && m.roleApprovalStatus !== 'pending') set.add(m.deptName)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [members])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter(m => {
      const roleVisible = m.roleApprovalStatus !== 'pending'

      // Text search across name + (visible) role/department
      if (q) {
        const haystack = [
          m.name,
          roleVisible ? m.roleName : null,
          roleVisible ? m.deptName : null,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }

      // Department filter
      if (deptFilter !== 'all') {
        if (!roleVisible || m.deptName !== deptFilter) return false
      }

      // Role presence filter
      if (roleFilter === 'with-role' && !(roleVisible && m.roleName)) return false
      if (roleFilter === 'without-role' && roleVisible && m.roleName) return false

      return true
    })
  }, [members, query, deptFilter, roleFilter])

  // Volunteers have no roles/departments, so those filters hide the section;
  // the text search still applies (by name).
  const filteredVolunteers = useMemo(() => {
    if (deptFilter !== 'all' || roleFilter !== 'all') return []
    const q = query.trim().toLowerCase()
    if (!q) return volunteers
    return volunteers.filter(v => `${v.name} volunteer`.toLowerCase().includes(q))
  }, [volunteers, query, deptFilter, roleFilter])

  const hasActiveFilter = query.trim() !== '' || deptFilter !== 'all' || roleFilter !== 'all'

  const selectStyle: React.CSSProperties = {
    padding: '0.75rem 2rem 0.75rem 1rem',
    fontSize: '0.85rem',
    color: 'var(--cream)',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgb(var(--gold-rgb) / 0.25)',
    borderRadius: '0.75rem',
    outline: 'none',
    letterSpacing: '0.03em',
    appearance: 'none',
    cursor: 'pointer',
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='%23C8A848' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.9rem center',
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .members-filter-bar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          max-width: 720px;
          margin: 0 auto 3rem;
        }
        .members-filter-bar .member-search-wrap { flex: 1 1 240px; min-width: 200px; }
        .members-filter-bar select option { color: var(--ink); }
      ` }} />

      {/* Search + filter bar */}
      <div className="members-filter-bar">
        <div className="member-search-wrap">
          <label htmlFor="member-search" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
            Search members by name or role
          </label>
          <input
            id="member-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or role…"
            autoComplete="off"
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              fontSize: '0.9rem',
              color: 'var(--cream)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgb(var(--gold-rgb) / 0.25)',
              borderRadius: '0.75rem',
              outline: 'none',
              letterSpacing: '0.03em',
            }}
          />
        </div>

        <label htmlFor="member-dept-filter" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
          Filter by department
        </label>
        <select
          id="member-dept-filter"
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          style={selectStyle}
          disabled={departments.length === 0}
        >
          <option value="all">All departments</option>
          {departments.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <label htmlFor="member-role-filter" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
          Filter by role status
        </label>
        <select
          id="member-role-filter"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
          style={selectStyle}
        >
          <option value="all">All members</option>
          <option value="with-role">With a role</option>
          <option value="without-role">Without a role</option>
        </select>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={() => { setQuery(''); setDeptFilter('all'); setRoleFilter('all') }}
            style={{
              padding: '0.75rem 1rem',
              fontSize: '0.8rem',
              color: 'var(--gold)',
              background: 'transparent',
              border: '1px solid rgb(var(--gold-rgb) / 0.25)',
              borderRadius: '0.75rem',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Member grid */}
      <ul aria-label="Approved members" style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gridAutoRows: '1fr',
        gap: '1.5rem',
      }}>
        {filtered.map(member => {
          const roleShown = member.roleName && member.roleApprovalStatus !== 'pending'
          return (
          <li key={member.dbId} style={{ display: 'flex', height: '100%' }}>
          <a
            href={`/members/${member.id}`}
            aria-label={roleShown ? `View ${member.name}'s profile — ${member.roleName}` : `View ${member.name}'s profile`}
            style={{ textDecoration: 'none', color: 'inherit', display: 'flex', height: '100%', width: '100%' }}
          >
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              padding: '1.25rem 1rem',
              border: '1px solid rgb(var(--gold-rgb) / 0.15)',
              borderRadius: '1rem',
              background: 'rgba(255,255,255,0.02)',
              cursor: 'pointer',
              transition: 'border-color 0.2s, background 0.2s',
            }}
            >
              {/* Avatar */}
              <div style={{
                width: '80px', height: '80px',
                borderRadius: '50%',
                border: '2px solid rgba(111,73,31,0.6)',
                background: 'rgb(var(--gold-rgb) / 0.08)',
                overflow: 'hidden',
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {member.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={supabaseResizedUrl(member.avatarUrl, 160) ?? ''} loading="lazy" decoding="async" alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span aria-hidden="true" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--gold)', opacity: 0.85 }}>
                    ✦
                  </span>
                )}
              </div>

              {/* Name */}
              <p style={{
                fontSize: '0.88rem',
                color: 'var(--parchment)',
                textAlign: 'center',
                margin: 0,
                lineHeight: 1.3,
                letterSpacing: '0.03em',
              }}>
                {member.name}
              </p>

              {/* Role — always rendered so all cards have the same natural height */}
              <p aria-hidden={!roleShown} style={{
                fontSize: '0.62rem',
                color: 'var(--gold)',
                opacity: roleShown ? 0.65 : 0,
                textAlign: 'center',
                margin: 0,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                lineHeight: 1.3,
                userSelect: 'none',
              }}>
                {roleShown ? member.roleName : ' '}
              </p>
            </div>
          </a>
          </li>
          )
        })}
      </ul>

      {/* Volunteers — helpers without a member profile, listed apart so the
          distinction from full members stays legible. Cards match the member
          cards (same outline) — the section heading and the purple Volunteer
          tag carry the distinction — and link to the volunteer's profile. */}
      {filteredVolunteers.length > 0 && (
        <section aria-labelledby="volunteers-heading" style={{ marginTop: filtered.length > 0 ? '3.5rem' : '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '0.4rem' }}>
            <span aria-hidden="true" style={{ flex: '0 1 120px', height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--purple-rgb) / 0.4))' }} />
            <h2 id="volunteers-heading" style={{
              fontSize: '0.8rem',
              fontWeight: 400,
              color: 'var(--purple)',
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              margin: 0,
              whiteSpace: 'nowrap',
              textShadow: '0 0 18px rgb(var(--purple-rgb) / 0.35)',
            }}>
              Volunteers
            </h2>
            <span aria-hidden="true" style={{ flex: '0 1 120px', height: '1px', background: 'linear-gradient(90deg, rgb(var(--purple-rgb) / 0.4), transparent)' }} />
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.72rem', opacity: 0.4, margin: '0 0 2rem', letterSpacing: '0.05em' }}>
            Helping hands lending support — not full camp members
          </p>

          <ul aria-label="Volunteers" style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gridAutoRows: '1fr',
            gap: '1.5rem',
          }}>
            {filteredVolunteers.map(v => (
              <li key={v.dbId} style={{ display: 'flex', height: '100%' }}>
                <a
                  href={`/members/${v.dbId}`}
                  aria-label={`View ${v.name}'s profile — Volunteer`}
                  style={{ textDecoration: 'none', color: 'inherit', display: 'flex', height: '100%', width: '100%' }}
                >
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    padding: '1.25rem 1rem',
                    border: '1px solid rgb(var(--gold-rgb) / 0.15)',
                    borderRadius: '1rem',
                    background: 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, background 0.2s',
                  }}>
                    {/* Avatar */}
                    <div style={{
                      width: '80px', height: '80px',
                      borderRadius: '50%',
                      border: '2px solid rgba(111,73,31,0.6)',
                      background: 'rgb(var(--gold-rgb) / 0.08)',
                      overflow: 'hidden',
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {v.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={supabaseResizedUrl(v.avatarUrl, 160) ?? ''} loading="lazy" decoding="async" alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span aria-hidden="true" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--gold)', opacity: 0.85 }}>
                          ✦
                        </span>
                      )}
                    </div>

                    {/* Name */}
                    <p style={{
                      fontSize: '0.88rem',
                      color: 'var(--parchment)',
                      textAlign: 'center',
                      margin: 0,
                      lineHeight: 1.3,
                      letterSpacing: '0.03em',
                    }}>
                      {v.name}
                    </p>

                    {/* Register tag — sits where a member card's role sits */}
                    <p style={{
                      fontSize: '0.62rem',
                      color: 'var(--purple)',
                      opacity: 0.75,
                      textAlign: 'center',
                      margin: 0,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      lineHeight: 1.3,
                      userSelect: 'none',
                    }}>
                      Volunteer
                    </p>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {members.length === 0 && volunteers.length === 0 && (
        <p style={{ textAlign: 'center', opacity: 0.35, fontStyle: 'italic', fontSize: '0.9rem' }}>
          The circle&rsquo;s still gathering — no members yet.
        </p>
      )}

      {(members.length > 0 || volunteers.length > 0) && filtered.length === 0 && filteredVolunteers.length === 0 && (
        <p style={{ textAlign: 'center', opacity: 0.35, fontStyle: 'italic', fontSize: '0.9rem' }}>
          No one matches those filters.
        </p>
      )}
    </>
  )
}

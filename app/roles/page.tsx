import { auth } from '@clerk/nextjs/server'
import { IconImage, ROUND_FILL } from '@/components/IconImage'
import { redirect } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { Header } from '@/components/Header'
import { isImageIcon } from '@/lib/icon-src'
import { roleSlug } from '@/lib/role-slug'
import { getApprovedMember } from '@/lib/members'
import { getCommunity } from '@/lib/community'
import { ClaimRoleButton } from './ClaimRoleButton'

export const dynamic = 'force-dynamic'

// The Registry of Roles — the permanent, readable home for every department
// and role. The signup picker links here for the full charge; the profile
// links here from a member's designation. An "eye" surface: the registry.

type RoleRow = {
  id: string
  name: string
  description: string | null
  capacity: number
  department_id: string
  purpose: string | null
  responsibilities_before: string | null
  responsibilities_during: string | null
  ideal_for: string | null
  commitment: string | null
  commitment_period: string | null
  requires_approval: boolean
}

// Commitment-level accents (same scale as the signup picker).
const COMMITMENT_TEXT: Record<string, string> = {
  'Low': 'var(--success)',
  'Low–Medium': '#a8cf6e',
  'Medium': 'var(--gold)',
  'Medium–High': '#d48c3c',
  'High': '#dc5050',
}

function Pill({ label, color = 'var(--gold)', borderAlpha = 0.35 }: { label: string; color?: string; borderAlpha?: number }) {
  return (
    <span style={{
      display: 'inline-block', padding: '0.18rem 0.6rem', borderRadius: '9999px',
      fontSize: '0.66rem', letterSpacing: '0.06em', color,
      border: `1px solid ${color}${Math.round(borderAlpha * 255).toString(16).padStart(2, '0')}`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function ChargeList({ heading, text }: { heading: string; text: string }) {
  return (
    <div>
      <p style={{ fontSize: '0.63rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, margin: '0 0 0.4rem' }}>
        {heading}
      </p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {text.split('\n').filter(Boolean).map((line, i) => (
          <li key={i} style={{ fontSize: '0.84rem', lineHeight: 1.7, opacity: 0.72, display: 'flex', gap: '0.5rem' }}>
            <span aria-hidden style={{ color: 'var(--gold)', opacity: 0.6, fontSize: '0.6rem', lineHeight: '1.9rem', flexShrink: 0 }}>✦</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default async function RolesRegistryPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  // Same gate as /schedule and /participate: approved members only —
  // canonical gate (members table + email fallback; see app/messages/page.tsx).
  const member = await getApprovedMember(community.id, userId)
  if (!member) redirect('/profile')

  const [deptRes, rolesRes, signupRes, roleCounts] = await Promise.all([
    db.from('departments').select('id, name, description, icon, sort_order').order('sort_order'),
    db.from('roles').select('id, name, description, capacity, department_id, purpose, responsibilities_before, responsibilities_during, ideal_for, commitment, commitment_period, requires_approval').order('sort_order'),
    db.from('camp_signups').select('role_id, role_approval_status').eq('clerk_user_id', userId).maybeSingle(),
    db.from('camp_signups').select('role_id').not('role_id', 'is', null),
  ])

  const signedUp: Record<string, number> = {}
  for (const row of roleCounts.data ?? []) {
    if (row.role_id) signedUp[row.role_id] = (signedUp[row.role_id] ?? 0) + 1
  }

  const roles = (rolesRes.data ?? []) as RoleRow[]
  const departments = (deptRes.data ?? [])
    .map(d => ({ ...d, roles: roles.filter(r => r.department_id === d.id) }))
    .filter(d => d.roles.length > 0)

  const signup = signupRes.data ?? null

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      <Header />
      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '4.5rem 1.5rem 6rem' }}>

        <div style={{ marginBottom: '2rem' }}>
          <a href="/participate" style={{ fontSize: '0.75rem', color: 'var(--gold)', opacity: 0.6, textDecoration: 'none', letterSpacing: '0.08em' }}>
            ← Back to Participate
          </a>
        </div>

        {/* Page heading */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '0.65rem', letterSpacing: '0.34em', textTransform: 'uppercase', color: 'var(--purple)', opacity: 0.85, margin: '0 0 0.5rem' }}>
            The Registry
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3rem)', color: 'var(--gold)', margin: 0, letterSpacing: '0.05em', textShadow: '0 0 40px rgb(var(--purple-rgb) / 0.35)' }}>
            Registry of Roles
          </h1>
          <p style={{ fontSize: '0.9rem', opacity: 0.55, margin: '0.75rem auto 0', maxWidth: '34rem', lineHeight: 1.65 }}>
            Every department and every charge, recorded in full. Read what each role
            asks of its keeper — and when one calls to you, claim it.
          </p>
        </div>

        {/* Department index */}
        <nav aria-label="Departments" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', marginBottom: '2.5rem' }}>
          {departments.map(d => (
            <a
              key={d.id}
              href={`#${roleSlug(d.name)}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.35rem 0.85rem', borderRadius: '9999px',
                border: '1px solid rgb(var(--gold-rgb) / 0.25)', background: 'rgb(var(--gold-rgb) / 0.04)',
                color: 'var(--gold)', textDecoration: 'none', fontSize: '0.75rem', letterSpacing: '0.05em',
              }}
            >
              {d.icon && (isImageIcon(d.icon)
                // eslint-disable-next-line @next/next/no-img-element
                ? <IconImage src={d.icon} size="0.95rem" fill={0.92} />
                : <span style={{ fontSize: '0.85rem' }}>{d.icon}</span>)}
              {d.name}
            </a>
          ))}
        </nav>

        {/* Two-column responsibilities on wider screens */}
        <style dangerouslySetInnerHTML={{ __html: `
          .registry-charge { display: grid; grid-template-columns: 1fr; gap: 1rem; }
          @media (min-width: 640px) {
            .registry-charge-2col { grid-template-columns: 1fr 1fr; gap: 1.5rem; }
          }
        ` }} />

        {departments.length === 0 && (
          <p style={{ textAlign: 'center', fontSize: '0.9rem', opacity: 0.5, fontStyle: 'italic', margin: '3rem 0', lineHeight: 1.7 }}>
            The registry is still being inscribed — departments and roles will appear here soon.
          </p>
        )}

        {departments.map(dept => (
          <section key={dept.id} id={roleSlug(dept.name)} style={{ scrollMarginTop: '84px', marginBottom: '3.5rem' }}>

            {/* Department heading — emblem, name, description */}
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 0.7rem',
                border: '1.5px solid var(--gold)',
                background: 'radial-gradient(circle at 42% 38%, rgb(var(--gold-rgb) / 0.16), rgba(8,0,18,0.85))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 18px rgb(var(--gold-rgb) / 0.18)',
              }}>
                {dept.icon && (isImageIcon(dept.icon)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <IconImage src={dept.icon} size="100%" fill={ROUND_FILL} opacity={0.92} />
                  : <span style={{ fontSize: '1.7rem', lineHeight: 1 }}>{dept.icon ?? '✦'}</span>)}
              </div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 3.5vw, 2rem)', color: 'var(--gold)', margin: 0, letterSpacing: '0.05em' }}>
                {dept.name}
              </h2>
              {dept.description && (
                <p style={{ fontSize: '0.92rem', color: '#C9B68F', opacity: 0.85, margin: '0.5rem auto 0', maxWidth: '30rem', lineHeight: 1.6, fontFamily: 'var(--font-cormorant-garamond), serif', fontStyle: 'italic' }}>
                  {dept.description}
                </p>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '38%', margin: '1rem auto 0' }}>
                <span aria-hidden style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.5))' }} />
                <span aria-hidden style={{ color: 'var(--gold)', fontSize: '0.55rem', opacity: 0.85, lineHeight: 1 }}>✦</span>
                <span aria-hidden style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, rgb(var(--gold-rgb) / 0.5), transparent)' }} />
              </div>
            </div>

            {/* Role entries */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {dept.roles.map((role: RoleRow) => {
                const count = signedUp[role.id] ?? 0
                const isCurrent = signup?.role_id === role.id
                const isPending = isCurrent && signup?.role_approval_status === 'pending'
                const isFull = count >= role.capacity && !isCurrent
                const openSpots = Math.max(0, role.capacity - count)
                const hasBoth = !!(role.responsibilities_before && role.responsibilities_during)
                return (
                  <article
                    key={role.id}
                    id={roleSlug(role.name)}
                    style={{
                      scrollMarginTop: '84px',
                      border: `1px solid rgb(var(--gold-rgb) / ${isCurrent ? 0.4 : 0.15})`,
                      borderRadius: '0.85rem',
                      background: isCurrent ? 'rgb(var(--gold-rgb) / 0.04)' : 'rgba(255,255,255,0.015)',
                      padding: '1.4rem 1.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--parchment)', margin: 0, letterSpacing: '0.04em' }}>
                        {role.name}
                      </h3>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {(role.commitment || role.commitment_period) && (
                          <Pill
                            label={[role.commitment, role.commitment_period].filter(Boolean).join(' · ')}
                            color={role.commitment ? COMMITMENT_TEXT[role.commitment] ?? 'var(--gold)' : 'var(--gold)'}
                          />
                        )}
                        <Pill label={isFull ? 'Full' : `${openSpots} of ${role.capacity} open`} color={isFull ? 'var(--danger)' : 'var(--gold)'} borderAlpha={0.25} />
                        {role.requires_approval && <Pill label="Approval required" color="var(--purple)" borderAlpha={0.3} />}
                      </div>
                    </div>

                    {(role.purpose || role.description) && (
                      <p style={{ fontSize: '0.9rem', lineHeight: 1.7, opacity: 0.78, margin: '0.4rem 0 0' }}>
                        {role.purpose || role.description}
                      </p>
                    )}

                    {(role.responsibilities_before || role.responsibilities_during) && (
                      <div className={`registry-charge${hasBoth ? ' registry-charge-2col' : ''}`} style={{ marginTop: '1.1rem' }}>
                        {role.responsibilities_before && <ChargeList heading="Before the event" text={role.responsibilities_before} />}
                        {role.responsibilities_during && <ChargeList heading="During the event" text={role.responsibilities_during} />}
                      </div>
                    )}

                    {role.ideal_for && (
                      <div style={{ marginTop: '1.1rem' }}>
                        <p style={{ fontSize: '0.63rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, margin: '0 0 0.3rem' }}>
                          Ideal for
                        </p>
                        <p style={{ fontSize: '0.9rem', lineHeight: 1.65, margin: 0, color: '#C9B68F', opacity: 0.9, fontStyle: 'italic', fontFamily: 'var(--font-cormorant-garamond), serif' }}>
                          {role.ideal_for}
                        </p>
                      </div>
                    )}

                    <div style={{ marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px solid rgb(var(--gold-rgb) / 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <ClaimRoleButton
                        roleId={role.id}
                        roleName={role.name}
                        requiresApproval={role.requires_approval}
                        isCurrent={isCurrent}
                        isPendingApproval={isPending}
                        isFull={isFull}
                      />
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ))}

        {/* Suggest-a-role pointer */}
        <p style={{ textAlign: 'center', fontSize: '0.8rem', opacity: 0.5, margin: '3rem 0 0', lineHeight: 1.7 }}>
          Don&rsquo;t see a charge that fits?{' '}
          <a href="/participate" style={{ color: 'var(--gold)', textDecoration: 'underline', textUnderlineOffset: '3px' }}>
            Suggest a role
          </a>{' '}
          from the Participate page.
        </p>
      </main>
    </div>
  )
}

import { HandsBackdrop } from '@/components/HandsBackdrop'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { requireAdmin } from '@/lib/admin-auth'
import { NotificationBell } from '@/app/admin/NotificationBell'
import { AdminNav } from '@/app/admin/AdminNav'
import { MembersDropdown } from './MembersDropdown'
import { getGroupNamesByUser } from '@/lib/groups'
import { getShiftEventByUser } from '@/lib/shift-signups'
import { getSuspendedClerkUserIds, isSuspended } from '@/lib/admin-counts'
import { getShiftHoursOverview } from '@/lib/shift-hours-overview'
import { shiftHue } from '@/lib/shift-colors'
import { getAttentionItems, getAdminRunway } from '@/lib/admin-attention'
import { getCommunity } from '@/lib/community'

const divider: React.CSSProperties = {
  height: '1px',
  background: 'linear-gradient(90deg, transparent, rgba(200,168,72,0.2), transparent)',
  margin: '2.5rem 0',
}

const card = (accent = 'gold'): React.CSSProperties => ({
  padding: '1.5rem',
  borderRadius: '1rem',
  border: accent === 'purple'
    ? '1px solid rgba(210,57,248,0.2)'
    : '1px solid rgba(200,168,72,0.15)',
  background: accent === 'purple'
    ? 'rgba(210,57,248,0.04)'
    : 'rgba(200,168,72,0.03)',
})

const statLabel: React.CSSProperties = {
  fontSize: '0.65rem',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: '#C8A848',
  opacity: 0.65,
  marginBottom: '0.35rem',
}

const statValue: React.CSSProperties = {
  fontFamily: 'TokyoDreams, serif',
  fontSize: '2.2rem',
  color: '#C8A848',
  lineHeight: 1,
  marginBottom: '0.25rem',
}

const statSub: React.CSSProperties = {
  fontSize: '0.78rem',
  opacity: 0.45,
}

export default async function OverviewPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  if (!(await requireAdmin())) redirect('/')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  // Everything below is independent — one parallel batch, no waterfalls.
  // attention/runway = the "Needs attention" digest + runway strip
  // (docs/admin-ux-handoff.md A1/A2).
  const [
    attention,
    runway,
    shiftEventByUser,
    shiftHours,
    groupNamesByUser,
    { data: groupRows },
    { data: applications },
    suspendedClerkIds,
    { data: signups },
    { data: volunteers },
    { data: notifications },
    { data: polls },
    { data: pollVotes },
  ] = await Promise.all([
    getAttentionItems(community.id),
    getAdminRunway(community.id),
    getShiftEventByUser(community.id),
    getShiftHoursOverview(community.id),
    getGroupNamesByUser(community.id),
    db.from('groups').select('id, name').order('sort_order'),
    db
      .from('applications')
      .select('id, first_name, last_name, preferred_name, email, status, clerk_user_id, rideshare')
      .order('submitted_at', { ascending: false }),
    // Suspended members (migration 063) — excluded from every participation
    // count below and surfaced in their own box, so paused commitments don't
    // muddy the organizer's numbers. Shared with Manage (lib/admin-counts.ts)
    // so "who is suspended" can never drift between tabs.
    getSuspendedClerkUserIds(community.id),
    db
      .from('camp_signups')
      .select('clerk_user_id, role_id, role_approval_status'),
    db
      .from('volunteers')
      .select('id, first_name, last_name, preferred_name, email, status')
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    db
      .from('admin_notifications')
      .select('id, application_id, event_type, message, details, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(20),
    db
      .from('polls')
      .select('id, question, options, visible, allow_multiple, expires_at, created_at')
      .order('created_at', { ascending: false }),
    db
      .from('poll_votes')
      .select('poll_id, option_index, clerk_user_id'),
  ])

  const all = applications ?? []
  // Suspended members are approved but paused — kept out of the participation
  // math and shown in their own box (migration 063). Matched by clerk_user_id.
  const approvedAll = all.filter(a => a.status === 'approved')
  const approved = approvedAll.filter(a => !isSuspended(a.clerk_user_id, suspendedClerkIds))
  const suspendedCount = approvedAll.length - approved.length
  const pending = all.filter(a => a.status === 'pending')
  const activeVolunteers = volunteers ?? []

  // Build poll results
  type PollResult = {
    id: string
    question: string
    options: string[]
    visible: boolean
    allow_multiple: boolean
    expires_at: string | null
    created_at: string
    counts: number[]
    totalVoters: number
  }
  const pollResults: PollResult[] = (polls ?? []).map(p => {
    const options = p.options as string[]
    const counts = Array(options.length).fill(0)
    const voters = new Set<string>()
    for (const v of pollVotes ?? []) {
      if (v.poll_id === p.id && v.option_index < counts.length) {
        counts[v.option_index]++
        voters.add(v.clerk_user_id)
      }
    }
    return { ...p, options, counts, totalVoters: voters.size }
  })

  // Build signup lookup. Roles come from camp_signups; "has a shift" uses the
  // shared union with member_shift_signups so Overview agrees with Manage.
  const signupMap = new Map((signups ?? []).map(s => [s.clerk_user_id, s]))

  // Members with signup status
  const members = approved.map(a => {
    const signup = a.clerk_user_id ? signupMap.get(a.clerk_user_id) : undefined
    const hasRole = !!signup?.role_id
    const hasShift = !!(a.clerk_user_id && shiftEventByUser[a.clerk_user_id])
    const rolePending = signup?.role_approval_status === 'pending'
    return {
      id: a.id as string,
      displayName: (a.preferred_name || a.first_name || '?') as string,
      email: a.email as string,
      hasRole,
      hasShift,
      rolePending,
    }
  })

  const complete = members.filter(m => m.hasRole && m.hasShift && !m.rolePending).length
  const incomplete = members.length - complete

  // Hours — real math from the shift schedule (getShiftHoursOverview).
  const fmtH = (n: number) => `${parseFloat(n.toFixed(2))}h`

  // Groups — one card per admin-configured group, so renames/additions in
  // Admin → Groups show up here without code changes.
  const memberGroupNames = (a: { clerk_user_id?: string | null }) => (a.clerk_user_id ? groupNamesByUser[a.clerk_user_id] ?? [] : [])
  const groupCards = (groupRows ?? []).map(g => ({
    id: g.id as string,
    name: g.name as string,
    members: approved.filter(a => memberGroupNames(a).includes(g.name)),
  }))
  const unassigned = approved.filter(a => memberGroupNames(a).length === 0)

  // Rideshare
  const RIDESHARE_OPTIONS = ['I need a ride', 'I can offer a ride', "I'm sorted", 'Not sure yet']
  const rideshareGroups = RIDESHARE_OPTIONS.map(option => ({
    label: option,
    members: approved.filter(a => a.rideshare === option),
  })).filter(g => g.members.length > 0)

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1, overflowX: 'clip' }}>
      <HandsBackdrop />

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 1.5rem 6rem', position: 'relative', zIndex: 1 }}>

        <AdminNav runway={runway} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
          <NotificationBell initialNotifications={notifications ?? []} />
        </div>

        <h1 style={{ fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', color: '#C8A848', marginBottom: '0.5rem', textAlign: 'center' }}>
          Overview
        </h1>
        <p style={{ textAlign: 'center', opacity: 0.4, fontSize: '0.85rem', marginBottom: '2.5rem' }}>
          {pending.length} pending · {approved.length} approved{suspendedCount > 0 ? ` · ${suspendedCount} suspended` : ''}
        </p>

        {/* ── NEEDS ATTENTION (A1) — the console's to-do surface ── */}
        <section style={{ marginBottom: '2.5rem' }}>
          <div style={{
            padding: '1.25rem 1.5rem',
            borderRadius: '0.85rem',
            border: attention.length > 0 ? '1px solid rgba(210,57,248,0.3)' : '1px solid rgba(200,168,72,0.15)',
            background: attention.length > 0 ? 'rgba(210,57,248,0.05)' : 'rgba(200,168,72,0.03)',
          }}>
            <p style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: attention.length > 0 ? '#D239F8' : '#C8A848', opacity: 0.8, margin: '0 0 0.9rem' }}>
              Needs attention
            </p>
            {attention.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.55, fontStyle: 'italic' }}>
                All quiet{runway.daysToCamp !== null ? ` — ${runway.daysToCamp} day${runway.daysToCamp === 1 ? '' : 's'} to camp` : ''}.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {attention.map(item => (
                  <a
                    key={item.id}
                    href={item.href}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                      textDecoration: 'none', padding: '0.35rem 0', borderBottom: '1px solid rgba(200,168,72,0.07)',
                    }}
                  >
                    <span style={{ fontSize: '0.9rem', color: '#F3EDE6', opacity: 0.85 }}>{item.text}</span>
                    <span style={{ fontSize: '0.78rem', color: '#D239F8', letterSpacing: '0.06em', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {item.verb} →
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── PARTICIPATION OVERVIEW ── */}
        <section style={{ marginBottom: '2.5rem' }}>
          <p style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C8A848', opacity: 0.55, marginBottom: '1.25rem' }}>
            Participation
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={card()}>
              <p style={statLabel}>Approved Campers</p>
              <p style={statValue}>{approved.length}</p>
              {pending.length > 0 ? (
                <a href="/admin#people" style={{ ...statSub, display: 'inline-block', color: '#D239F8', opacity: 0.8, textDecoration: 'none' }}>
                  Review {pending.length} pending →
                </a>
              ) : (
                <p style={statSub}>none pending review</p>
              )}
            </div>
            <div style={card()}>
              <p style={statLabel}>Signup Complete</p>
              <p style={{ ...statValue, color: complete > 0 ? '#7dcf8e' : '#C8A848' }}>{complete}</p>
              <p style={statSub}>{incomplete} still to complete</p>
            </div>
            <div style={card('purple')}>
              <p style={{ ...statLabel, color: '#D239F8' }}>Active Volunteers</p>
              <p style={{ ...statValue, color: '#D239F8' }}>{activeVolunteers.length}</p>
              <p style={statSub}>outside volunteers</p>
            </div>
            {suspendedCount > 0 && (
              <div style={{ ...card(), borderColor: 'rgba(255,180,80,0.3)', background: 'rgba(255,180,80,0.05)' }}>
                <p style={{ ...statLabel, color: '#ffcf80' }}>Suspended</p>
                <p style={{ ...statValue, color: '#ffcf80' }}>{suspendedCount}</p>
                <p style={statSub}>paused — not counted above</p>
              </div>
            )}
          </div>

          {/* Member list */}
          <div style={{ padding: '1.25rem 1.5rem', borderRadius: '0.85rem', border: '1px solid rgba(200,168,72,0.12)', background: 'rgba(255,255,255,0.02)' }}>
            <MembersDropdown members={members} />
          </div>
        </section>

        <div style={divider} />

        {/* ── SHIFT HOURS ── */}
        <section style={{ marginBottom: '2.5rem' }}>
          <p style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C8A848', opacity: 0.55, marginBottom: '1.25rem' }}>
            Shift Hours
          </p>

          {shiftHours.types.length === 0 ? (
            <p style={{ fontSize: '0.85rem', opacity: 0.35, fontStyle: 'italic' }}>No shifts on the schedule yet.</p>
          ) : (
            <>
              {/* Supply vs demand: promised = hours members owe by requirement;
                  to fill = spot-hours the schedule opens (capped shifts only —
                  an uncapped shift has no defined demand). */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={card()}>
                  <p style={statLabel}>Hours Promised</p>
                  <p style={statValue}>{fmtH(shiftHours.totalPromisedHours)}</p>
                  <p style={statSub}>owed by requirements across {shiftHours.approvedMemberCount} members</p>
                </div>
                <div style={card()}>
                  <p style={statLabel}>Hours to Fill</p>
                  <p style={statValue}>{fmtH(shiftHours.totalToFillHours)}</p>
                  <p style={statSub}>
                    {shiftHours.cappedSlots > 0
                      ? `spots × length on the ${shiftHours.cappedSlots} shift${shiftHours.cappedSlots === 1 ? '' : 's'} with set spots`
                      : 'no shifts have set spots yet'}
                    {shiftHours.slotCount > shiftHours.cappedSlots ? ` · ${shiftHours.slotCount - shiftHours.cappedSlots} uncapped` : ''}
                  </p>
                </div>
                <div style={card()}>
                  <p style={statLabel}>Hours Filled</p>
                  <p style={{ ...statValue, color: shiftHours.totalFilledHours > 0 ? '#7dcf8e' : '#C8A848' }}>{fmtH(shiftHours.totalFilledHours)}</p>
                  <p style={statSub}>{shiftHours.totalSignups} signup{shiftHours.totalSignups === 1 ? '' : 's'} by {shiftHours.memberCount} member{shiftHours.memberCount === 1 ? '' : 's'}</p>
                </div>
                <div style={card()}>
                  <p style={statLabel}>Empty Shifts</p>
                  <p style={{ ...statValue, color: shiftHours.emptySlots > 0 ? '#ffb432' : '#7dcf8e' }}>{shiftHours.emptySlots}</p>
                  <p style={statSub}>{shiftHours.emptySlots > 0 ? 'shifts with no signups yet' : 'every shift has someone'}</p>
                </div>
              </div>

              {/* Per-type breakdown, coloured to match the schedule's shift palette.
                  Facts only — an uncapped shift has no defined "full", so no
                  completion bars/percentages here. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {shiftHours.types.map(t => {
                  const hue = t.paletteIndex >= 0 ? shiftHue(t.paletteIndex) : { rgb: '200,168,72', accent: '#C8A848' }
                  const uncapped = t.slotCount - t.cappedSlots
                  return (
                    <div key={t.id ?? 'untyped'} style={{ ...card(), borderColor: `rgba(${hue.rgb},0.25)`, background: `rgba(${hue.rgb},0.04)` }}>
                      <p style={{ ...statLabel, color: hue.accent, opacity: 0.85 }}>{t.name}</p>
                      <p style={{ ...statValue, fontSize: '1.6rem', color: hue.accent }}>
                        {fmtH(t.promisedHours)}
                        <span style={{ fontSize: '0.85rem', opacity: 0.55 }}> promised{t.promisedMembers > 0 ? ` · ${t.promisedMembers} member${t.promisedMembers === 1 ? '' : 's'}` : ''}</span>
                      </p>
                      <p style={{ ...statSub, margin: '0.45rem 0 0' }}>
                        {t.slotCount === 0
                          ? 'nothing scheduled yet'
                          : t.cappedSlots > 0
                            ? `${fmtH(t.toFillHours)} to fill across ${t.cappedSlots} shift${t.cappedSlots === 1 ? '' : 's'}${uncapped > 0 ? ` · ${uncapped} uncapped` : ''}`
                            : `${t.slotCount} shift${t.slotCount === 1 ? '' : 's'} · no set spots`}
                      </p>
                      <p style={{ ...statSub, margin: '0.15rem 0 0' }}>
                        {fmtH(t.filledHours)} filled · {t.signupCount} signup{t.signupCount === 1 ? '' : 's'}
                      </p>
                      {t.slotCount > 0 && (
                        <p style={{ ...statSub, margin: '0.15rem 0 0', color: t.emptySlots > 0 ? '#ffb432' : undefined, opacity: t.emptySlots > 0 ? 0.75 : 0.45 }}>
                          {t.emptySlots > 0
                            ? `${t.emptySlots} of ${t.slotCount} shift${t.slotCount === 1 ? '' : 's'} empty`
                            : 'every shift has someone'}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>

        <div style={divider} />

        {/* ── GROUPS ── */}
        <section>
          <p style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C8A848', opacity: 0.55, marginBottom: '1.25rem' }}>
            Groups
          </p>

          {groupCards.length === 0 ? (
            <p style={{ fontSize: '0.85rem', opacity: 0.35, fontStyle: 'italic' }}>No groups configured yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              {groupCards.map(g => (
                <div key={g.id} style={card()}>
                  <p style={statLabel}>{g.name}</p>
                  <p style={statValue}>{g.members.length}</p>
                  <MemberPills members={g.members} />
                </div>
              ))}
            </div>
          )}

          {unassigned.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div style={{ ...card(), opacity: 0.7 }}>
                <p style={statLabel}>In no group</p>
                <p style={{ ...statValue, fontSize: '1.5rem' }}>{unassigned.length}</p>
                <MemberPills members={unassigned} />
                <a href="/admin/configure#structure" style={{ display: 'inline-block', marginTop: '0.6rem', fontSize: '0.75rem', color: '#C8A848', opacity: 0.75, textDecoration: 'none' }}>
                  Assign in Groups →
                </a>
              </div>
            </div>
          )}
        </section>

        <div style={divider} />

        {/* ── RIDESHARE ── */}
        <section>
          <p style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C8A848', opacity: 0.55, marginBottom: '1.25rem' }}>
            Rideshare
          </p>

          {rideshareGroups.length === 0 ? (
            <p style={{ fontSize: '0.85rem', opacity: 0.35, fontStyle: 'italic' }}>No rideshare responses yet.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {rideshareGroups.map(({ label, members }) => {
                const accent = label === 'I need a ride' ? 'rgba(210,57,248,0.2)'
                  : label === 'I can offer a ride' ? 'rgba(80,200,160,0.2)'
                  : 'rgba(200,168,72,0.15)'
                const color = label === 'I need a ride' ? '#D239F8'
                  : label === 'I can offer a ride' ? '#50c8a0'
                  : '#C8A848'
                return (
                  <div key={label} style={{ ...card(), borderColor: accent }}>
                    <p style={{ ...statLabel, color }}>{label}</p>
                    <p style={{ ...statValue, fontSize: '1.5rem', color }}>{members.length}</p>
                    <MemberPills members={members} />
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── POLL RESULTS ── */}
        {pollResults.length > 0 && (
          <>
            <div style={divider} />
            <section>
              <p style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C8A848', opacity: 0.55, marginBottom: '1.25rem' }}>
                Poll Results
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {pollResults.map(poll => {
                  const total = poll.counts.reduce((a, b) => a + b, 0)
                  const expired = poll.expires_at ? new Date(poll.expires_at) < new Date() : false
                  return (
                    <div key={poll.id} style={{ ...card(), padding: '1.25rem 1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#EDE0C8', lineHeight: 1.45, flex: 1 }}>
                          {poll.question}
                        </p>
                        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          {!poll.visible && (
                            <span style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: '#888', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9999px', padding: '0.1rem 0.5rem' }}>
                              Hidden
                            </span>
                          )}
                          {expired && (
                            <span style={{ fontSize: '0.62rem', letterSpacing: '0.08em', color: '#ffb432', border: '1px solid rgba(255,180,50,0.25)', borderRadius: '9999px', padding: '0.1rem 0.5rem' }}>
                              Closed
                            </span>
                          )}
                          <span style={{ fontSize: '0.68rem', color: '#C8A848', opacity: 0.5, alignSelf: 'center' }}>
                            {poll.totalVoters} {poll.totalVoters === 1 ? 'voter' : 'voters'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                        {poll.options.map((opt, i) => {
                          const count = poll.counts[i]
                          const pct = total > 0 ? Math.round((count / total) * 100) : 0
                          const isTop = count > 0 && count === Math.max(...poll.counts)
                          return (
                            <div key={i}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                <span style={{ fontSize: '0.8rem', color: isTop ? '#C8A848' : '#F3EDE6', opacity: isTop ? 1 : 0.7 }}>
                                  {isTop && '✦ '}{opt}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#C8A848', opacity: 0.6, flexShrink: 0, marginLeft: '1rem' }}>
                                  {count} · {pct}%
                                </span>
                              </div>
                              <div style={{ height: '6px', borderRadius: '9999px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                <div style={{
                                  height: '100%',
                                  width: `${pct}%`,
                                  borderRadius: '9999px',
                                  background: isTop
                                    ? 'linear-gradient(90deg, #C8A848, #e8c868)'
                                    : 'rgba(200,168,72,0.35)',
                                  transition: 'width 0.4s ease',
                                }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {poll.allow_multiple && (
                        <p style={{ fontSize: '0.65rem', opacity: 0.3, margin: '0.75rem 0 0' }}>Multiple choice — total votes may exceed voters</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}

      </div>
    </div>
  )
}

function MemberPills({ members }: { members: Array<{ id?: unknown; preferred_name?: unknown; first_name?: unknown; last_name?: unknown }> }) {
  if (members.length === 0) return <p style={{ fontSize: '0.78rem', opacity: 0.35, fontStyle: 'italic', marginTop: '0.5rem' }}>None yet</p>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.6rem' }}>
      {members.map((m, i) => {
        const name = (m.preferred_name || m.first_name || '?') as string
        const id = m.id as string | undefined
        const pillStyle: React.CSSProperties = { padding: '0.2rem 0.6rem', borderRadius: '9999px', background: 'rgba(200,168,72,0.08)', border: '1px solid rgba(200,168,72,0.15)', fontSize: '0.72rem', opacity: 0.8, textDecoration: 'none', color: 'inherit' }
        return id ? (
          <a key={i} href={`/admin/${id}`} style={pillStyle}>
            {name}
          </a>
        ) : (
          <span key={i} style={pillStyle}>
            {name}
          </span>
        )
      })}
    </div>
  )
}

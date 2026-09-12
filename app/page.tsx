import { auth, currentUser } from '@clerk/nextjs/server'
import { IconImage } from '@/components/IconImage'
import Image from 'next/image'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Section, Kicker, GoldDivider } from '@/components/Section'
import { ScheduleSection } from '@/components/ScheduleSection'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { themeBrand } from '@/lib/theme'
import { getAllPageContent, getPageContent } from '@/lib/page-content'
import { getMemberGroups } from '@/lib/groups'
import { getResourceWidgetState } from '@/lib/resources'
import { buildAttunementChecklist, memberGroupCounts, requiredItems, commitmentItems } from '@/lib/attunement'
import { getMemberShiftState, EMPTY_MEMBER_SHIFT_STATE } from '@/lib/shift-attunement'
import { parseDuesConfig, duesAppliesToMembers } from '@/lib/dues'
import { getRadioFeed, type RadioEventRow } from '@/lib/radio'
import { RadioMessage } from '@/components/RadioMessage'
import { daysUntilEvent } from '@/lib/camp-event'
import { clockLabel } from '@/lib/shift-hours'

import { HomePageEditor } from './HomePageEditor'
import { supabaseResizedUrl } from '@/lib/supabase-image'
import { PollWidget } from './PollWidget'
import { SpotlightWidget, type SpotlightMember } from './SpotlightWidget'
import { ShoutoutWidget, type Shoutout } from './ShoutoutWidget'

export const dynamic = 'force-dynamic'

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default async function Home() {
  const { userId } = await auth()
  const community = await getCommunity()
  const brand = themeBrand(community.theme)
  const db = tenantDb(community.id)

  // ── Fetch member data when signed in ─────────────────────────
  let application: Record<string, unknown> | null = null
  let campSignup: Record<string, unknown> | null = null
  let upcomingEvents: { id: string; day: string; time: string; title: string; subtitle: string | null; icon_type: string; event_date: string | null }[] = []
  let nextEventDate: string | null = null
  let leadUpEvents: { id: string; title: string; event_date: string | null; start_time: string | null; location: string | null; host: string | null; image_url: string | null }[] = []
  let spotlightPool: unknown[] = []
  let userFirstName: string | null = null
  let recentActivity: RadioEventRow[] = []
  type Announcement = { id: string; title: string; body: string | null; pinned: boolean; created_at: string }
  let announcements: Announcement[] = []
  type PollRow = { id: string; question: string; options: string[]; allow_multiple: boolean; expires_at: string | null; initialCounts: number[]; initialUserVotes: number[] }
  let polls: PollRow[] = []
  let shoutouts: Shoutout[] = []
let isAdmin = false
let canManagePolls = false

  // Kicked off before any member work — page content is user-independent and
  // is awaited in the parallel batch further down. (Supabase builders never
  // reject; errors come back on the result object.)
  const pageContentQuery = getAllPageContent(community.id)

  if (userId) {
    // currentUser() is a Clerk Backend-API round-trip; the application lookup
    // keys on clerk_user_id (every production row has it), so the two can
    // overlap instead of queueing. Email matching survives as a rare fallback.
    const [user, appByIdRes] = await Promise.all([
      currentUser(),
      db
        .from('applications')
        .select('*')
        .eq('clerk_user_id', userId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const email = user?.emailAddresses[0]?.emailAddress
    userFirstName = user?.firstName ?? null
    // Permissions are community-scoped columns on the member row (branch 1d).
    const { data: perm } = await db
      .from('members').select('role, can_manage_polls').eq('clerk_user_id', userId).maybeSingle()
    isAdmin = perm?.role === 'admin'
    canManagePolls = perm?.can_manage_polls === true

    let appRaw = appByIdRes.data
    if (!appRaw && email) {
      const { data } = await db
        .from('applications')
        .select('*')
        .eq('email', email)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      appRaw = data
    }

    application = appRaw?.status === 'cancelled' ? null : appRaw ?? null

    if (application?.status === 'approved') {
      const [signupResult, eventsResult, leadUpResult, spotlightResult, announcementsResult, pollsResult, pollVotesResult, shoutoutsResult, nextEventResult, radioFeed] = await Promise.all([
        db
          .from('camp_signups')
          .select('role_id, role_approval_status, roles(name, description, purpose, department_id, departments(name, icon))')
          .eq('clerk_user_id', userId)
          .maybeSingle(),
        db
          .from('schedule_events')
          .select('id, day, time, title, subtitle, icon_type, event_date')
          .eq('visible', true)
          // The teaser previews the schedule page — off-schedule events skip it too.
          .eq('show_on_schedule', true)
          .or(`event_date.is.null,event_date.lte.${new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}`)
          .or(`event_date.is.null,event_date.gte.${new Date().toISOString().slice(0, 10)}`)
          .order('event_date', { ascending: true, nullsFirst: false })
          .order('sort_order', { ascending: true })
          .limit(4),
        db
          .from('lead_up_events')
          .select('id, title, event_date, start_time, location, host, image_url')
          .eq('visible', true)
          .or(`event_date.is.null,event_date.gte.${new Date().toISOString().slice(0, 10)}`)
          .order('event_date', { ascending: true, nullsFirst: false })
          .order('sort_order', { ascending: true })
          .limit(4),
        db
          .from('applications')
          .select('id, preferred_name, first_name, avatar_url, pronouns, clerk_user_id, find_at_camp')
          .eq('status', 'approved')
          .neq('clerk_user_id', userId)
          .limit(12),
        db
          .from('announcements')
          .select('id, title, body, pinned, created_at')
          .eq('visible', true)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order('pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(5),
        db
          .from('polls')
          .select('id, question, options, allow_multiple, expires_at')
          .eq('visible', true)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order('created_at', { ascending: false }),
        db
          .from('poll_votes')
          .select('poll_id, option_index')
          .eq('clerk_user_id', userId),
        db
          .from('shoutouts')
          .select('id, clerk_user_id, author_name, body, created_at')
          .eq('visible', true)
          .order('created_at', { ascending: false })
          .limit(50),
        // First dated future event regardless of the 14-day teaser window — lets
        // the teaser say "schedule begins <date>" instead of a bare empty state.
        db
          .from('schedule_events')
          .select('event_date')
          .eq('visible', true)
          .eq('show_on_schedule', true)
          .gte('event_date', new Date().toISOString().slice(0, 10))
          .order('event_date', { ascending: true })
          .limit(1)
          .maybeSingle(),
        // "On the Air" teaser — the latest Radio events (docs/radio.md)
        getRadioFeed(community.id, 6),
      ])

      campSignup = signupResult.data ?? null
      upcomingEvents = (eventsResult.data ?? []) as typeof upcomingEvents
      leadUpEvents = (leadUpResult.data ?? []) as typeof leadUpEvents
      nextEventDate = (nextEventResult.data as { event_date: string | null } | null)?.event_date ?? null
      spotlightPool = spotlightResult.data ?? []
      announcements = (announcementsResult.data ?? []) as Announcement[]

      // Second stage — three JS joins that depend on the first batch but not
      // on each other, so they share one round-trip.
      const shoutoutRows = (shoutoutsResult.data ?? []) as Omit<Shoutout, 'avatar_url'>[]
      const rawPolls = (pollsResult.data ?? []) as { id: string; question: string; options: string[]; allow_multiple: boolean; expires_at: string | null }[]
      const pool = spotlightPool as SpotlightMember[]
      const authorIds = Array.from(new Set(shoutoutRows.map(s => s.clerk_user_id)))
      const pollIds = rawPolls.map(p => p.id)
      const clerkIds = pool.map(m => m.clerk_user_id).filter(Boolean) as string[]

      const empty = Promise.resolve({ data: null })
      const [authorRowsRes, allVotesRes, signupRowsRes] = await Promise.all([
        // Enrich shoutouts with each author's current avatar (no FK — join in JS).
        authorIds.length > 0
          ? db.from('applications').select('clerk_user_id, avatar_url').in('clerk_user_id', authorIds)
          : empty,
        pollIds.length > 0
          ? db.from('poll_votes').select('poll_id, option_index').in('poll_id', pollIds)
          : empty,
        // Role info for all spotlight pool members
        clerkIds.length > 0
          ? db.from('camp_signups').select('clerk_user_id, roles(name, departments(name))').in('clerk_user_id', clerkIds)
          : empty,
      ])

      if (shoutoutRows.length > 0) {
        const authorRows = (authorRowsRes.data ?? []) as { clerk_user_id: string; avatar_url: string | null }[]
        const avatarMap = Object.fromEntries(authorRows.map(a => [a.clerk_user_id, a.avatar_url]))
        shoutouts = shoutoutRows.map(s => ({ ...s, avatar_url: avatarMap[s.clerk_user_id] ?? null }))
      }

      const userVoteRows = (pollVotesResult.data ?? []) as { poll_id: string; option_index: number }[]
      if (rawPolls.length > 0) {
        const allVotes = (allVotesRes.data ?? []) as { poll_id: string; option_index: number }[]
        polls = rawPolls.map(p => {
          const counts = Array(p.options.length).fill(0)
          for (const v of allVotes) {
            if (v.poll_id === p.id && v.option_index < counts.length) counts[v.option_index]++
          }
          const initialUserVotes = userVoteRows.filter(v => v.poll_id === p.id).map(v => v.option_index)
          return { ...p, initialCounts: counts, initialUserVotes }
        })
      }

      recentActivity = radioFeed

      if (pool.length > 0) {
        const signupRows = (signupRowsRes.data ?? []) as { clerk_user_id: string; roles: unknown }[]
        const roleMap = Object.fromEntries(
          signupRows.map(r => {
            const rolesRaw = r.roles as { name: string; departments: { name: string }[] | null } | { name: string; departments: { name: string }[] | null }[] | null
            const role = (Array.isArray(rolesRaw) ? rolesRaw[0] : rolesRaw) as { name: string; departments: { name: string }[] | null } | null
            return [r.clerk_user_id, { role_name: role?.name ?? null, dept_name: role?.departments?.[0]?.name ?? null }]
          })
        )
        spotlightPool = pool.map(m => ({ ...m, ...( m.clerk_user_id ? roleMap[m.clerk_user_id] ?? {} : {}) }))
      }
    }
  }

  // ── Page content + member-derived state (one parallel round-trip) ──
  // isApproved is needed before the batch to keep getResourceWidgetState
  // approved-only (its widget only renders for approved members anyway).
  const isApprovedForBatch = application?.status === 'approved'
  const shiftClerkId = (application?.clerk_user_id as string | null) ?? userId
  const [pageContentResult, memberGroups, shiftState, resourceWidget, suspendedResult] = await Promise.all([
    pageContentQuery,
    // Groups the member belongs to (replaces the old setup_preference "contributions").
    getMemberGroups(community.id, application?.clerk_user_id as string | null),
    shiftClerkId ? getMemberShiftState(community.id, shiftClerkId) : Promise.resolve(EMPTY_MEMBER_SHIFT_STATE),
    // "Bring Something" widget state: the list needing the most attention +
    // the member's own commitments. null = no targeted items yet (hidden).
    isApprovedForBatch ? getResourceWidgetState(community.id, shiftClerkId) : Promise.resolve(null),
    // Suspension flag (063) — a suspended member holds no commitments, so we
    // swap the attunement banner for a "paused" notice instead of nagging them.
    isApprovedForBatch && application?.clerk_user_id
      ? db.from('members').select('suspended_at, dues_paid_at, dues_reported_at').eq('clerk_user_id', application.clerk_user_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const isSuspended = !!(suspendedResult?.data?.suspended_at)
  const duesPaid = !!(suspendedResult?.data?.dues_paid_at)
  const duesReported = !!(suspendedResult?.data?.dues_reported_at)
  const pageContent: Record<string, string> = pageContentResult
  const c = (key: string, fallback: string) => pageContent[key] ?? fallback

  // ── Dashboard layout (admin-configurable widget order) ────────
  const DEFAULT_WIDGET_ORDER = ['announcements', 'resources', 'shoutouts', 'polls', 'events', 'spotlight', 'activity']
  let dashLayout: { order: string[]; hidden: string[]; widths?: Record<string, string> } = { order: DEFAULT_WIDGET_ORDER, hidden: [] }
  try {
    if (pageContent['dashboard_layout']) dashLayout = JSON.parse(pageContent['dashboard_layout'])
  } catch {}
  // Ensure any new widget IDs are appended if missing from saved order
  for (const id of DEFAULT_WIDGET_ORDER) {
    if (!dashLayout.order.includes(id)) dashLayout.order.push(id)
  }
  const visibleWidgets = dashLayout.order.filter(id => !dashLayout.hidden.includes(id))

  // ── Derived values ────────────────────────────────────────────
  const isApproved = application?.status === 'approved'

  const roleInfo = campSignup?.roles as { name?: string; description?: string | null; purpose?: string | null; departments?: { name?: string; icon?: string } | null } | null
  const badgeDeptName = roleInfo?.departments?.name ?? null
  const badgeRoleName = roleInfo?.name ?? null

  const { groupCountsByCollection, totalGroupCount } = memberGroupCounts(memberGroups)

  const displayName = (application?.preferred_name as string | null) ?? (application?.first_name as string | null) ?? userFirstName ?? 'Welcome'

  // Attunement checklist — shared with the profile page via buildAttunementChecklist
  // so the home banner's outstanding count always matches the profile checklist.
  const attunementTasks = buildAttunementChecklist(pageContent['config_attunement_tasks'], {
    hasPhoto: !!application?.avatar_url,
    duesPaid,
    duesReported,
    duesActiveForMembers: duesAppliesToMembers(parseDuesConfig(pageContent['config_dues'])),
    groupCountsByCollection,
    totalGroupCount,
    roleDone: !!campSignup?.role_id && campSignup?.role_approval_status !== 'pending',
    hasShift: shiftState.hasShift,
    shiftSignupOpen: pageContent['config_shift_signup_open'] !== 'false',
    hoursByShiftType: shiftState.hoursByShiftType,
    derivedShiftRequirements: shiftState.derivedShiftRequirements,
  })
  // "Attuned" = the required tier only; commitments (group/role-derived shift
  // hours) are surfaced as their own gentler line, never as a blocker.
  const requiredTasks = requiredItems(attunementTasks)
  const commitmentTasks = commitmentItems(attunementTasks)
  const allAttuned = requiredTasks.every(t => t.done)
  const commitmentsOutstanding = commitmentTasks.filter(t => !t.done).length

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const daysUntil = daysUntilEvent(pageContent['config_event_start_date'])

  // ── APPROVED MEMBER DASHBOARD ─────────────────────────────────
  if (isApproved) {
    return (
      <>
        <Header />
        <main style={{ paddingTop: '64px' }}>
          <style dangerouslySetInnerHTML={{ __html: `
            .dash-quote-card { display: block; }
            [data-widget-id] { display: flex; flex-direction: column; }
            [data-widget-id] > * { flex: 1; }
            .dash-hero-inner { display: flex; width: 100%; padding: 2.25rem 2.5rem; align-items: center; justify-content: space-between; gap: 2rem; }
            .dash-spotlight  { display: grid; grid-template-columns: 5fr 7fr; gap: 1.25rem; align-items: start; }
            .dash-quicklinks { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
            .dash-attune {
              display: flex; align-items: center; flex-wrap: wrap; gap: 1.25rem;
              padding: 1rem 1.4rem; border-radius: 0.9rem;
              border: 1px solid rgb(var(--gold-rgb) / 0.45);
              background: rgb(var(--gold-rgb) / 0.09);
              transition: border-color 0.2s ease, background 0.2s ease;
            }
            .dash-attune:hover { border-color: rgb(var(--gold-rgb) / 0.75); background: rgb(var(--gold-rgb) / 0.14); }
            .dash-attune-meta-mobile, .dash-attune-chev { display: none; }
            @media (max-width: 680px) {
              .dash-quote-card { display: none !important; }
              [data-width="half"], [data-width="third"], [data-width="twothirds"] { flex: 0 0 100% !important; }
              .dash-hero-inner { flex-direction: column; align-items: flex-start; padding: 1.5rem 1.25rem; gap: 1rem; }
              .dash-spotlight  { grid-template-columns: 1fr; }
              .dash-quicklinks { grid-template-columns: 1fr; }
              /* Collapse the attunement banner to one compact row: icon · title · count · chevron.
                 !important overrides the components' inline styles (IconImage box, title margin). */
              .dash-attune { padding: 0.6rem 0.9rem; gap: 0.7rem; flex-wrap: nowrap; }
              .dash-attune > span:first-of-type { width: 30px !important; height: 30px !important; }
              .dash-attune-body { min-width: 0 !important; }
              .dash-attune-title { margin: 0 !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
              .dash-attune-detail, .dash-attune-bar, .dash-attune-cta { display: none !important; }
              .dash-attune-meta-mobile { display: inline; }
              .dash-attune-chev { display: inline; }
            }
          ` }} />

          <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2.5rem 1.5rem 6rem' }}>

            {/* ── HERO BANNER ── */}
            <div style={{
              position: 'relative',
              borderRadius: '1.25rem',
              overflow: 'hidden',
              marginBottom: '1.5rem',
              minHeight: '220px',
              display: 'flex',
              alignItems: 'stretch',
            }}>
              {brand.heroImage && <Image
                src={brand.heroImage}
                alt=""
                fill
                priority
                // Dimmed to 38% brightness — artifacts are invisible, so the
                // preloaded LCP-competing image can ship much lighter.
                quality={50}
                sizes="(max-width: 1100px) 100vw, 1100px"
                style={{ objectFit: 'cover', objectPosition: 'center 40%', filter: 'brightness(0.38) saturate(1.2)' }}
              />}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(90deg, rgb(var(--ink-rgb) / 0.95) 0%, rgb(var(--ink-rgb) / 0.65) 55%, rgb(var(--ink-rgb) / 0.15) 100%)',
              }} />
              <div className="dash-hero-inner" style={{ position: 'relative', zIndex: 1 }}>
                {/* Left: greeting + countdown */}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.68rem', letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.65, marginBottom: '0.5rem' }}>
                    Good {greeting}
                  </p>
                  <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.6rem)', color: 'var(--gold)', margin: '0 0 0.35rem', textShadow: '0 2px 20px rgba(0,0,0,0.9)', lineHeight: 1.15 }}>
                    Welcome back, {displayName}.
                  </h1>
                  <p style={{ fontSize: '0.88rem', opacity: 0.5, marginBottom: '0.5rem' }}>
                    {allAttuned ? 'Fully attuned.' : 'Attunement continues.'}
                  </p>
                  {c('home_tagline', '') && (
                    <p data-editable-key="home_tagline" style={{ fontSize: '0.85rem', fontStyle: 'italic', opacity: 0.65, marginBottom: '1.25rem', lineHeight: 1.6 }}>
                      {c('home_tagline', '')}
                    </p>
                  )}
                  {daysUntil > 0 && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.4rem 1rem',
                      border: '1px solid rgb(var(--gold-rgb) / 0.35)',
                      borderRadius: '9999px',
                      background: 'rgb(var(--gold-rgb) / 0.07)',
                      fontSize: '0.72rem', letterSpacing: '0.18em', color: 'var(--gold)',
                    }}>
                      ✦ {daysUntil} DAYS UNTIL WHAT IF
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* ── SUSPENDED NOTICE (replaces the attunement nudge while paused) ── */}
            {isSuspended && (
              <a href="/profile" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem', padding: '1rem 1.4rem', borderRadius: '0.9rem', border: '1px solid rgba(255,180,80,0.4)', background: 'rgba(255,180,80,0.08)', textDecoration: 'none' }}>
                <div style={{ flex: 1, minWidth: '220px' }}>
                  <p style={{ margin: '0 0 0.3rem', color: 'var(--warning)' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', letterSpacing: '0.04em' }}>Attendance paused</span>
                  </p>
                  <p style={{ margin: 0, fontSize: '0.82rem', fontStyle: 'italic', color: 'var(--cream)', opacity: 0.75, lineHeight: 1.5 }}>
                    Your commitments are on hold. Everything's still here to explore — resume anytime from your profile.
                  </p>
                </div>
                <span style={{ flexShrink: 0, padding: '0.45rem 1.1rem', border: '1px solid rgba(255,180,80,0.5)', borderRadius: '9999px', background: 'rgba(255,180,80,0.08)', fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--warning)' }}>
                  MANAGE →
                </span>
              </a>
            )}

            {/* ── ATTUNEMENT BANNER (required tasks outstanding, or commitments to fill) ── */}
            {!isSuspended && (!allAttuned || commitmentsOutstanding > 0) && (() => {
              const outstandingTasks = requiredTasks.filter(t => !t.done)
              const outstanding = outstandingTasks.length
              const doneCount = requiredTasks.length - outstanding
              const named = outstandingTasks.slice(0, 3)
              const unnamed = outstanding - named.length
              return (
                <a href="/profile" className="dash-attune" style={{ marginBottom: '1.25rem', textDecoration: 'none' }}>
                  <IconImage src="/asset-library/icons/eye-in-triangle.webp" size={54} fill={0.85} />
                  <div className="dash-attune-body" style={{ flex: 1, minWidth: '220px' }}>
                    <p className="dash-attune-title" style={{ margin: '0 0 0.3rem', color: 'var(--gold)' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', letterSpacing: '0.04em' }}>Attunement</span>
                      {!allAttuned && requiredTasks.length > 0 && (
                        <span style={{ fontSize: '0.72rem', letterSpacing: '0.14em', opacity: 0.6, marginLeft: '0.75rem' }}>
                          {doneCount} OF {requiredTasks.length}
                        </span>
                      )}
                      {allAttuned && (
                        <span className="dash-attune-meta-mobile" style={{ fontSize: '0.72rem', letterSpacing: '0.14em', opacity: 0.6, marginLeft: '0.75rem' }}>
                          {commitmentsOutstanding} COMMITMENT{commitmentsOutstanding === 1 ? '' : 'S'}
                        </span>
                      )}
                    </p>
                    <p className="dash-attune-detail" style={{ margin: 0, fontSize: '0.82rem', fontStyle: 'italic', color: 'var(--cream)', opacity: 0.75, lineHeight: 1.5 }}>
                      {!allAttuned
                        ? <>
                            {named.map((t, i) => (
                              <span key={t.id}>
                                {i > 0 && <span style={{ color: 'var(--gold)', opacity: 0.6, margin: '0 0.5rem' }}>·</span>}
                                {t.label}
                              </span>
                            ))}
                            {unnamed > 0 && <span style={{ opacity: 0.6 }}> · +{unnamed} more</span>}
                            {commitmentsOutstanding > 0 && <span style={{ opacity: 0.6 }}> · {commitmentsOutstanding} commitment{commitmentsOutstanding === 1 ? '' : 's'}</span>}
                          </>
                        : <>Attuned — {commitmentsOutstanding} commitment{commitmentsOutstanding === 1 ? '' : 's'} still to fill.</>}
                    </p>
                    {!allAttuned && requiredTasks.length > 0 && (
                      <div className="dash-attune-bar" style={{ marginTop: '0.55rem', height: '3px', borderRadius: '2px', background: 'rgb(var(--gold-rgb) / 0.18)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.round((doneCount / requiredTasks.length) * 100)}%`, height: '100%', background: 'var(--gold)' }} />
                      </div>
                    )}
                  </div>
                  <span className="dash-attune-cta" style={{
                    flexShrink: 0,
                    padding: '0.45rem 1.1rem',
                    border: '1px solid rgb(var(--gold-rgb) / 0.5)',
                    borderRadius: '9999px',
                    background: 'rgb(var(--gold-rgb) / 0.08)',
                    fontSize: '0.7rem', letterSpacing: '0.16em', color: 'var(--gold)',
                  }}>
                    {allAttuned ? 'VIEW COMMITMENTS' : 'COMPLETE THE CHECKLIST'} →
                  </span>
                  <span className="dash-attune-chev" aria-hidden style={{ flexShrink: 0, color: 'var(--gold)', opacity: 0.7, fontSize: '0.9rem' }}>→</span>
                </a>
              )
            })()}

            {/* ── WIDGETS (order + visibility controlled by admin) ── */}
            {(() => {
              const atCamp = upcomingEvents
              // Lead-up gatherings come from their own table; map them into the
              // EventList shape (real dates → weekday label).
              const leadUp = leadUpEvents.map(e => ({
                id: e.id,
                day: e.event_date ? new Date(e.event_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }) : 'TBD',
                time: clockLabel(e.start_time),
                title: e.title,
                subtitle: e.location || (e.host ? `with ${e.host}` : null),
                icon_type: 'star',
                event_date: e.event_date,
                image_url: e.image_url,
              }))
              // When nothing falls inside the teaser window but dated events exist
              // further out, say when the schedule starts instead of implying the
              // schedule is empty.
              const emptyText = nextEventDate
                ? `The schedule begins ${new Date(nextEventDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`
                : 'Nothing scheduled yet.'

              const EventList = ({ events, label, href }: { events: (typeof upcomingEvents[number] & { image_url?: string | null })[]; label: string; href: string }) => (
                <div style={{ border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '1rem', background: 'rgba(10,0,20,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
                  <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.15)' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '0.7rem', letterSpacing: '0.18em', color: 'var(--gold)', margin: 0, textTransform: 'uppercase', opacity: 0.9 }}>
                      {label}
                    </p>
                  </div>
                  <div style={{ padding: '0.5rem 0', flex: 1 }}>
                    {events.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', opacity: 0.4, fontStyle: 'italic', textAlign: 'center', padding: '1.5rem' }}>
                        {emptyText}
                      </p>
                    ) : events.map((ev, i) => (
                      <div key={ev.id} style={{
                        display: 'flex', alignItems: 'center', gap: '1rem',
                        padding: '0.9rem 1.5rem',
                        borderBottom: i < events.length - 1 ? '1px solid rgb(var(--gold-rgb) / 0.08)' : 'none',
                      }}>
                        <div style={{
                          flexShrink: 0, width: '64px', textAlign: 'center',
                          padding: '0.4rem 0.5rem',
                          border: '1px solid rgb(var(--gold-rgb) / 0.2)',
                          borderRadius: '0.5rem',
                          background: 'rgb(var(--gold-rgb) / 0.06)',
                        }}>
                          <p style={{ fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.65, margin: '0 0 0.1rem' }}>
                            {ev.day?.slice(0, 3)?.toUpperCase()}
                          </p>
                          <p style={{ fontSize: '0.65rem', color: 'var(--gold)', margin: 0, letterSpacing: '0.04em' }}>
                            {ev.time?.split(':').slice(0, 2).join(':') ?? ''}
                          </p>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.85rem', color: 'var(--parchment)', margin: '0 0 0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.title}
                          </p>
                          {ev.subtitle && (
                            <p style={{ fontSize: '0.72rem', color: '#B0947A', margin: 0, opacity: 0.75 }}>{ev.subtitle}</p>
                          )}
                        </div>
                        {ev.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={supabaseResizedUrl(ev.image_url, 176) ?? ''} loading="lazy" decoding="async" alt="" style={{ width: '88px', height: '88px', objectFit: 'cover', borderRadius: '0.6rem', flexShrink: 0, border: '1px solid rgb(var(--gold-rgb) / 0.25)' }} />
                        )}
                        <span style={{ color: 'var(--gold)', opacity: 0.25, fontSize: '0.8rem', flexShrink: 0 }}>›</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid rgb(var(--gold-rgb) / 0.1)' }}>
                    <a href={href} style={{ fontSize: '0.75rem', color: 'var(--gold)', opacity: 0.7, textDecoration: 'none' }}>
                      View full schedule →
                    </a>
                  </div>
                </div>
              )

              const widgetMap: Record<string, React.ReactNode> = {
                announcements: announcements.length > 0 ? (
                  <div style={{ border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '1rem', background: 'rgba(10,0,20,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
                    <div style={{ padding: '1rem 1.5rem 0.75rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.12)' }}>
                      <p style={{ fontSize: '0.62rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, margin: 0 }}>Announcements</p>
                    </div>
                    <div>
                      {announcements.map((a, i) => (
                        <div key={a.id} style={{ padding: '1rem 1.5rem', borderBottom: i < announcements.length - 1 ? '1px solid rgb(var(--gold-rgb) / 0.08)' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: a.body ? '0.35rem' : 0 }}>
                            {a.pinned && <span style={{ fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--purple)', border: '1px solid rgb(var(--purple-rgb) / 0.3)', borderRadius: '9999px', padding: '0.1rem 0.45rem', flexShrink: 0 }}>Pinned</span>}
                            <p style={{ fontSize: '0.9rem', color: 'var(--gold)', margin: 0, fontFamily: 'var(--font-display)' }}>{a.title}</p>
                          </div>
                          {a.body && <p style={{ fontSize: '0.83rem', opacity: 0.7, margin: 0, lineHeight: 1.65 }}>{a.body}</p>}
                          <p style={{ fontSize: '0.68rem', opacity: 0.3, margin: '0.4rem 0 0' }}>{timeAgo(a.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null,

                // "Bring Something" answers "what does the community still
                // need from me?" at a glance: a compact index — one row per list
                // a member opted into the dashboard (show_on_dashboard, mig 070)
                // with its readiness — an overall % header, and a personal line
                // (my commitments, or a nudge). Whole card clicks through to
                // /participate#bring. Hidden entirely until a list is flagged
                // for the dashboard.
                resources: resourceWidget ? (() => {
                  const w = resourceWidget
                  const MAX_ROWS = 6
                  const shown = w.lists.slice(0, MAX_ROWS)
                  const moreLists = w.lists.length - shown.length
                  const bringing = w.myClaims.slice(0, 3).map(cl => (cl.quantity > 1 ? `${cl.resourceName} ×${cl.quantity}` : cl.resourceName)).join(', ')
                  const moreClaims = w.myClaims.length - 3
                  // A list with no tracked needs is an OPEN CALL, not an empty
                  // inventory — it reads as an invitation, and its description
                  // (written in the list editor) is the callout copy.
                  const rowStatus = (r: typeof w.lists[number]) =>
                    !r.hasTargets
                      ? r.contributions > 0
                        ? { text: `${r.contributions} being brought`, color: 'var(--cream)', op: 0.4 }
                        : { text: '✦ open call', color: 'var(--gold)', op: 0.75 }
                      : r.allCovered
                        ? { text: '✓ all covered', color: 'var(--success)', op: 0.9 }
                        : { text: `${r.remaining} still needed`, color: 'var(--gold)', op: 0.95 }
                  return (
                    <a href="/participate#bring" style={{ border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '1rem', background: 'rgba(10,0,20,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', textDecoration: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', padding: '1rem 1.5rem 0.75rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.12)' }}>
                        <p style={{ fontSize: '0.62rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, margin: 0 }}>Bring Something</p>
                        {w.hasAnyTargets && (
                          <p style={{ fontSize: '0.66rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.8, margin: 0, flexShrink: 0 }}>{w.percentReady}% Ready</p>
                        )}
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0.85rem 1.5rem 1.1rem' }}>
                        {/* One row per list — the community's provisioning at a glance */}
                        <div>
                          {shown.map((r, i) => {
                            const s = rowStatus(r)
                            return (
                              <div key={i} style={{ padding: '0.4rem 0', borderTop: i > 0 ? '1px solid rgb(var(--gold-rgb) / 0.07)' : 'none' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.92rem', color: 'var(--gold)', opacity: 0.9, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                                  <span style={{ fontSize: '0.72rem', color: s.color, opacity: s.op, flexShrink: 0, whiteSpace: 'nowrap' }}>{s.text}</span>
                                </div>
                                {/* The open-ended callout — the list's own words */}
                                {!r.hasTargets && r.description && (
                                  <p style={{ margin: '0.1rem 0 0', fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--cream)', opacity: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</p>
                                )}
                              </div>
                            )
                          })}
                          {moreLists > 0 && (
                            <p style={{ margin: '0.4rem 0 0', fontSize: '0.7rem', opacity: 0.4, fontStyle: 'italic', color: 'var(--cream)' }}>+{moreLists} more list{moreLists === 1 ? '' : 's'}</p>
                          )}
                        </div>
                        <p style={{ fontSize: '0.75rem', margin: 'auto 0 0', paddingTop: '0.7rem', borderTop: '1px solid rgb(var(--gold-rgb) / 0.08)' }}>
                          {w.myClaims.length > 0 ? (
                            <span style={{ color: 'var(--gold)', opacity: 0.85 }}>You&apos;re bringing {bringing}{moreClaims > 0 ? ` +${moreClaims} more` : ''} — thank you ✦</span>
                          ) : w.allCovered ? (
                            <span style={{ color: 'var(--cream)', opacity: 0.45 }}>Everything&apos;s covered — the community has it in hand.</span>
                          ) : (
                            <span style={{ color: 'var(--cream)', opacity: 0.45 }}>You haven&apos;t committed anything yet — see what&apos;s needed →</span>
                          )}
                        </p>
                      </div>
                    </a>
                  )
                })() : null,

                shoutouts: (
                  <ShoutoutWidget
                    initialShoutouts={shoutouts}
                    currentUserId={userId}
                    currentUserAvatar={(application?.avatar_url as string | null) ?? null}
                    isApproved={isApproved}
                    isAdmin={isAdmin}
                  />
                ),

                polls: <PollWidget polls={polls} canManage={isAdmin || canManagePolls} />,

                events: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
                    {leadUp.length > 0 && <EventList events={leadUp} label="Lead-Up Gatherings" href="/schedule" />}
                    {atCamp.length > 0 && <EventList events={atCamp} label="Upcoming Gatherings" href="/schedule" />}
                    {leadUp.length === 0 && atCamp.length === 0 && <EventList events={[]} label="Upcoming Gatherings" href="/schedule" />}
                  </div>
                ),

                spotlight: spotlightPool.length > 0 ? (
                  <SpotlightWidget
                    pool={spotlightPool as SpotlightMember[]}
                    initialIndex={Math.floor(Date.now() / 60000) % spotlightPool.length}
                  />
                ) : null,

                activity: recentActivity.length > 0 ? (
                  <div style={{ border: '1px solid rgb(var(--gold-rgb) / 0.2)', borderRadius: '1rem', background: 'rgba(10,0,20,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
                    <div style={{ padding: '1rem 1.5rem 0.75rem', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.12)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <p style={{ fontSize: '0.62rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--gold)', opacity: 0.55, margin: 0 }}>On the Air</p>
                      <a href="/radio" style={{ fontSize: '0.68rem', color: 'var(--gold)', opacity: 0.6, textDecoration: 'none', letterSpacing: '0.06em' }}>Tune in →</a>
                    </div>
                    <div>
                      {recentActivity.map((item, i) => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.7rem 1.5rem', borderBottom: i < recentActivity.length - 1 ? '1px solid rgb(var(--gold-rgb) / 0.07)' : 'none' }}>
                          <span aria-hidden style={{ flexShrink: 0, width: '28px', display: 'flex', justifyContent: 'center', fontSize: '1.05rem' }}>
                            {item.icon && (item.icon.startsWith('/') || item.icon.startsWith('http'))
                              ? <IconImage src={item.icon} size="26px" fill={0.9} />
                              : (item.icon || '✦')}
                          </span>
                          <p style={{ flex: 1, margin: 0, fontSize: '0.82rem', lineHeight: 1.4, opacity: 0.8, minWidth: 0 }}>
                            <RadioMessage text={item.message} />
                          </p>
                          <span style={{ fontSize: '0.7rem', opacity: 0.3, flexShrink: 0 }}>{timeAgo(item.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null,
              }

              const widths: Record<string, string> = { spotlight: 'third', ...(dashLayout.widths ?? {}) }
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'stretch' }}>
                  {visibleWidgets.map(id => {
                    const widget = widgetMap[id]
                    if (!widget) return null
                    const w = widths[id]
                    const isHalf = w === 'half'
                    const isThird = w === 'third'
                    const isTwoThirds = w === 'twothirds'
                    return (
                      <div
                        key={id}
                        data-widget-id={id}
                        data-width={isHalf ? 'half' : isThird ? 'third' : isTwoThirds ? 'twothirds' : 'full'}
                        style={{ flex: isThird ? '0 0 calc(33.333% - 0.833rem)' : isTwoThirds ? '0 0 calc(66.667% - 0.417rem)' : isHalf ? '0 0 calc(50% - 0.625rem)' : '0 0 100%', minWidth: 0 }}
                      >
                        {widget}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* ── MANY HANDS LINK ── */}
            <div className="dash-quicklinks" style={{ marginTop: '1.25rem' }}>
              <a href="/participate" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', border: '1px solid rgb(var(--gold-rgb) / 0.18)', borderRadius: '1rem', background: 'rgb(var(--gold-rgb) / 0.03)', textDecoration: 'none' }}>
                <div>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--gold)', margin: '0 0 0.2rem' }}>Role & Shift</p>
                  <p style={{ fontSize: '0.8rem', opacity: 0.45, margin: 0 }}>Choose your role and shift</p>
                </div>
                <span style={{ fontSize: '1rem', color: 'var(--gold)', opacity: 0.4 }}>→</span>
              </a>
              <a href="/members" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', border: '1px solid rgb(var(--gold-rgb) / 0.18)', borderRadius: '1rem', background: 'rgb(var(--gold-rgb) / 0.03)', textDecoration: 'none' }}>
                <div>
                  <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--gold)', margin: '0 0 0.2rem' }}>Many Hands</p>
                  <p style={{ fontSize: '0.8rem', opacity: 0.45, margin: 0 }}>View your fellow camp members</p>
                </div>
                <span style={{ fontSize: '1rem', color: 'var(--gold)', opacity: 0.4 }}>→</span>
              </a>
            </div>

          </div>
        </main>

        {isAdmin && <HomePageEditor initialContent={pageContent} />}
      </>
    )
  }

  // ── PUBLIC MARKETING PAGE ─────────────────────────────────────
  return (
    <>
      <Header />

      <main style={{ paddingTop: '64px' }}>

        {/* ─── HERO ─────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '3.5rem 1.5rem 5rem',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Ambient glow */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: '35%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '900px',
              height: '600px',
              borderRadius: '50%',
              // The gradient is the glow — a filter: blur() on top was visually
              // redundant and costs a huge offscreen paint on phones.
              background: 'radial-gradient(ellipse, rgb(var(--purple-rgb) / 0.12) 0%, rgb(var(--gold-rgb) / 0.04) 50%, transparent 72%)',
              pointerEvents: 'none',
            }}
          />

          {/* Event kicker */}
          <p
            style={{
              fontSize: '0.68rem',
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: 'var(--purple)',
              marginBottom: '1.25rem',
              opacity: 0.85,
            }}
          >
            {[community.eventName, brand.kicker].filter(Boolean).join(' · ')}
          </p>

          {/* Wordmark */}
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(3.5rem, 12vw, 7rem)',
              color: 'var(--gold)',
              margin: '0 0 0.25rem',
              lineHeight: 1,
              textShadow: '0 0 40px rgb(var(--purple-rgb) / 0.5), 0 0 80px rgb(var(--purple-rgb) / 0.2), 0 4px 20px rgba(0,0,0,0.8)',
              letterSpacing: '-0.01em',
            }}
          >
            {community.name}
          </h1>

          {/* Brand tagline (communities.theme.brand.tagline) */}
          <p style={{ fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.3, marginBottom: '2.5rem' }}>
            {brand.tagline ?? ''}
          </p>

          {/* Hero image (communities.theme.brand.hero_image; hidden when unset) */}
          {brand.heroImage && <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '900px',
              borderRadius: '1.25rem',
              overflow: 'hidden',
              boxShadow: '0 0 60px rgb(var(--purple-rgb) / 0.2), 0 0 120px rgb(var(--gold-rgb) / 0.08), 0 32px 80px rgba(0,0,0,0.7)',
              border: '1px solid rgb(var(--gold-rgb) / 0.18)',
            }}
          >
            <Image
              src={brand.heroImage}
              alt={community.name}
              width={1200}
              height={675}
              priority
              quality={65}
              style={{ width: '100%', height: 'auto', display: 'block', filter: 'brightness(0.9) saturate(1.1)' }}
            />
            {/* Bottom fade into ink */}
            <div style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: '40%',
              background: 'linear-gradient(to top, rgb(var(--ink-rgb) / 0.7), transparent)',
              pointerEvents: 'none',
            }} />
          </div>}

          {/* Tagline */}
          <p
            style={{
              fontSize: 'clamp(0.95rem, 2.5vw, 1.15rem)',
              fontStyle: 'italic',
              maxWidth: '460px',
              lineHeight: 1.8,
              opacity: 0.7,
              marginTop: '2.5rem',
              marginBottom: '2rem',
              fontFamily: 'var(--font-libre-baskerville)',
            }}
          >
            {c('home_tagline', 'Built by many hands. Held by many hearts.')}
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <a
              href="/apply"
              style={{
                display: 'inline-block',
                padding: '0.85rem 2.5rem',
                borderRadius: '9999px',
                border: '1px solid rgb(var(--gold-rgb) / 0.6)',
                background: 'rgb(var(--gold-rgb) / 0.1)',
                color: 'var(--lemon)',
                textDecoration: 'none',
                letterSpacing: '0.14em',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-display)',
              }}
            >
              Apply to Camp
            </a>
            <a
              href="/sign-in"
              style={{
                display: 'inline-block',
                padding: '0.85rem 2.5rem',
                borderRadius: '9999px',
                border: '1px solid rgb(var(--cream-rgb) / 0.15)',
                background: 'transparent',
                color: 'var(--cream)',
                textDecoration: 'none',
                letterSpacing: '0.14em',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-display)',
                opacity: 0.65,
              }}
            >
              Sign In
            </a>
          </div>
        </div>

        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--purple-rgb) / 0.35), transparent)' }} />

        {/* ─── ABOUT ────────────────────────────────────────── */}
        <Section id="about">
          <Kicker>What is this, exactly</Kicker>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3rem)', marginBottom: '2rem', lineHeight: 1.15, textAlign: 'center' }}>
            {c('home_about_heading', 'A camp. A collective.')}
          </h2>
          <div style={{
            border: '1px solid rgb(var(--gold-rgb) / 0.15)',
            borderRadius: '1.25rem',
            background: 'rgba(10,0,20,0.45)',
            padding: '2rem 2.5rem',
          }}>
            {c('home_about_body', '').split('\n\n').filter(Boolean).map((para, i) => (
              <p key={i} style={{ fontSize: '1.05rem', lineHeight: 1.85, marginBottom: '1.25rem', fontStyle: i === 3 ? 'italic' : undefined, opacity: i === 3 ? 0.65 : 0.85, fontFamily: 'var(--font-libre-baskerville)' }}>
                {para}
              </p>
            ))}
          </div>
        </Section>

        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.15), transparent)' }} />

        {/* ─── PRINCIPLES ───────────────────────────────────── */}
        <Section id="principles">
          <Kicker>How we show up</Kicker>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3rem)', marginBottom: '2.5rem', lineHeight: 1.15, textAlign: 'center' }}>
            Our Principles
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {[
              { title: 'Dignity', body: 'Every person deserves to be treated with dignity and respect.' },
              { title: 'Participation', body: 'Communities thrive when people contribute within their capacity.' },
              { title: 'Stewardship', body: 'No one person should be responsible for carrying the whole community.' },
              { title: 'Communication', body: 'We strive to communicate honestly, directly, and in good faith.' },
            ].map(({ title, body }) => (
              <div key={title} style={{
                border: '1px solid rgb(var(--gold-rgb) / 0.18)',
                borderRadius: '1.25rem',
                background: 'rgba(10,0,20,0.45)',
                padding: '1.75rem 2rem',
              }}>
                <p style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.1rem',
                  color: 'var(--gold)',
                  margin: '0 0 0.75rem',
                  letterSpacing: '0.04em',
                }}>
                  {title}
                </p>
                <div style={{ height: '1px', background: 'linear-gradient(90deg, rgb(var(--gold-rgb) / 0.3), transparent)', marginBottom: '0.9rem' }} />
                <p style={{
                  fontSize: '0.97rem',
                  lineHeight: 1.8,
                  opacity: 0.75,
                  margin: 0,
                  fontFamily: 'var(--font-libre-baskerville)',
                }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.15), transparent)' }} />

        {/* ─── PARTICIPATE ──────────────────────────────────── */}
        <Section id="participate">
          <Kicker>How to be in it</Kicker>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3rem)', marginBottom: '2rem', textAlign: 'center' }}>
            {c('home_participate_heading', 'This Camp Runs on Participation')}
          </h2>
          <div style={{
            border: '1px solid rgb(var(--gold-rgb) / 0.15)',
            borderRadius: '1.25rem',
            background: 'rgba(10,0,20,0.45)',
            padding: '2rem 2.5rem',
            marginBottom: '2.5rem',
          }}>
            <p style={{ fontSize: '1.05rem', lineHeight: 1.85, margin: 0, opacity: 0.85, fontFamily: 'var(--font-libre-baskerville)' }}>
              {c('home_participate_body', 'The Many Hands hold us all up. Sometimes we do the carrying. Sometimes we are carried. Everyone contributes in some way: setup, teardown, cooking, welcoming, cleaning, decorating, emotional support, infrastructure, care.')}
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <a
              href="/apply"
              style={{
                display: 'inline-block',
                padding: '0.9rem 2.75rem',
                borderRadius: '9999px',
                border: '1px solid rgb(var(--gold-rgb) / 0.55)',
                background: 'rgb(var(--gold-rgb) / 0.1)',
                color: 'var(--lemon)',
                textDecoration: 'none',
                letterSpacing: '0.14em',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-display)',
              }}
            >
              Apply to Camp
            </a>
          </div>
        </Section>

        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.15), transparent)' }} />

        {/* ─── SCHEDULE ─────────────────────────────────────── */}
        <Section id="schedule">
          <Kicker>When things happen</Kicker>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 5vw, 3rem)', marginBottom: '3rem', textAlign: 'center' }}>
            Schedule
          </h2>
          <ScheduleSection />
        </Section>


      </main>

      <Footer />

      {isAdmin && <HomePageEditor initialContent={pageContent} />}
    </>
  )
}

import { tenantDb } from './tenant-db'
import { getPageContent, getPageContentValue } from './page-content'
import { eventRangeDays, shiftOccurrenceDates } from './shift-occurrences'

// Data behind the admin console's "Needs attention" digest (A1) and the
// days-to-camp runway strip (A2) — see docs/admin-ux-handoff.md. Derived
// entirely from existing tables; no new config.

export type AttentionItem = {
  id: string
  text: string   // "12 applications await review"
  verb: string   // "Review"
  href: string   // deep link into the console
}

export type RunwayMilestone = {
  label: string
  dateLabel: string // "Jul 5"
  href: string
}

export type AdminRunway = {
  daysToCamp: number | null
  milestones: RunwayMilestone[]
}

const todayLocal = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD

const shortDate = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// Whole days from today until an ISO date (noon-anchored to dodge DST edges).
const daysUntil = (iso: string) =>
  Math.round((Date.parse(iso + 'T12:00:00') - Date.parse(todayLocal() + 'T12:00:00')) / 86_400_000)

// At most five prioritized, actionable lines. Every line names work and links
// to where it's done. Order = review queues first, then time-sensitive comms.
export async function getAttentionItems(communityId: string): Promise<AttentionItem[]> {
  const db = tenantDb(communityId)
  const [apps, vols, roleReqs, roleSuggs, { data: gatherings }, { data: leadShifts }, { data: shiftHolds }, rangeConfig] = await Promise.all([
    db.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('volunteers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db.from('camp_signups').select('clerk_user_id', { count: 'exact', head: true }).eq('role_approval_status', 'pending'),
    db.from('role_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    db
      .from('lead_up_events')
      .select('id, title, event_date, visible, notified_at')
      .eq('visible', true)
      .gte('event_date', todayLocal())
      .order('event_date', { ascending: true }),
    // Full-but-leadless shifts: the organizer opted the shift into having a
    // lead (049), every seat is taken, and nobody holds the ✦ — the one state
    // members can no longer notice at signup time, so it's flagged here.
    db
      .from('schedule_events')
      .select('id, title, capacity, event_date, is_recurring, recurrence_days')
      .eq('participation_type', 'shift')
      .eq('visible', true)
      .eq('needs_lead', true)
      .gt('capacity', 0)
      .or(`event_date.is.null,event_date.gte.${todayLocal()},is_recurring.eq.true`),
    db.from('member_shift_signups').select('clerk_user_id, schedule_event_id, occurrence_date, role'),
    getPageContent(communityId, ['config_event_start_date', 'config_event_end_date']),
  ])

  const items: AttentionItem[] = []
  const n = (c: number | null | undefined) => c ?? 0

  if (n(apps.count) > 0) items.push({
    id: 'applications',
    text: `${apps.count} application${apps.count === 1 ? '' : 's'} await${apps.count === 1 ? 's' : ''} review`,
    verb: 'Review', href: '/admin#people',
  })
  if (n(vols.count) > 0) items.push({
    id: 'volunteers',
    text: `${vols.count} volunteer signup${vols.count === 1 ? '' : 's'} pending`,
    verb: 'Review', href: '/admin#people',
  })
  if (n(roleReqs.count) > 0) items.push({
    id: 'role-requests',
    text: `${roleReqs.count} role request${roleReqs.count === 1 ? '' : 's'} await${roleReqs.count === 1 ? 's' : ''} an answer`,
    verb: 'Answer', href: '/admin#people',
  })
  if (n(roleSuggs.count) > 0) items.push({
    id: 'role-suggestions',
    text: `${roleSuggs.count} role suggestion${roleSuggs.count === 1 ? '' : 's'} from members`,
    verb: 'Answer', href: '/admin#people',
  })

  const unnotified = (gatherings ?? []).find(g => !g.notified_at)
  if (unnotified) items.push({
    id: `notify-${unnotified.id}`,
    text: `“${unnotified.title}” (${unnotified.event_date ? shortDate(unnotified.event_date) : 'undated'}) hasn't been announced`,
    verb: 'Notify', href: '/admin/program#lead-up',
  })

  // Holds = member_shift_signups, deduped per (member, event, night).
  // Each night of a recurring shift is checked independently for fullness, so a
  // single full-and-leadless night flags. Mirrors fetchAllHolds so "full" agrees
  // with the member-facing counts.
  const occKey = (eventId: string, date: string | null) => `${eventId}|${date ?? ''}`
  const holdsByOcc = new Map<string, Set<string>>()
  const leadOccs = new Set<string>()
  for (const r of (shiftHolds ?? []).map(r => ({ ...r, occurrence_date: (r.occurrence_date as string | null) ?? null }))) {
    if (!r.schedule_event_id) continue
    const k = occKey(r.schedule_event_id, r.occurrence_date)
    const set = holdsByOcc.get(k) ?? new Set<string>()
    set.add(r.clerk_user_id)
    holdsByOcc.set(k, set)
    if ('role' in r && r.role === 'lead') leadOccs.add(k)
  }
  const rangeDays = eventRangeDays(
    rangeConfig['config_event_start_date'],
    rangeConfig['config_event_end_date'],
  )
  // A shift flags if ANY of its occurrences (nights) is full and leadless.
  const leadless = (leadShifts ?? []).filter(s => {
    const cap = s.capacity as number
    const dates: (string | null)[] = s.is_recurring
      ? (shiftOccurrenceDates(s, rangeDays).length ? shiftOccurrenceDates(s, rangeDays) : [])
      : [null]
    return dates.some(d => {
      const k = occKey(s.id, d)
      return !leadOccs.has(k) && (holdsByOcc.get(k)?.size ?? 0) >= cap
    })
  })
  if (leadless.length === 1) items.push({
    id: `leadless-${leadless[0].id}`,
    text: `“${leadless[0].title}” is fully signed up but has no lead ✦`,
    verb: 'Assign', href: '/admin/program#schedule',
  })
  else if (leadless.length > 1) items.push({
    id: 'leadless-shifts',
    text: `${leadless.length} shifts are fully signed up but have no lead ✦`,
    verb: 'Assign', href: '/admin/program#schedule',
  })

  return items.slice(0, 5)
}

// The thin always-visible strip under the admin tabs: days to camp + the next
// couple of dated milestones on the runway.
export async function getAdminRunway(communityId: string): Promise<AdminRunway> {
  const db = tenantDb(communityId)
  const [startValue, { data: gatherings }] = await Promise.all([
    getPageContentValue(communityId, 'config_event_start_date'),
    db
      .from('lead_up_events')
      .select('title, event_date')
      .eq('visible', true)
      .gte('event_date', todayLocal())
      .order('event_date', { ascending: true })
      .limit(2),
  ])

  const start = startValue || null
  const daysToCamp = start ? Math.max(0, daysUntil(start)) : null

  const milestones: RunwayMilestone[] = (gatherings ?? [])
    .filter(g => g.event_date)
    .map(g => ({ label: g.title as string, dateLabel: shortDate(g.event_date as string), href: '/admin/program#lead-up' }))
  if (start) milestones.push({ label: 'Camp begins', dateLabel: shortDate(start), href: '/admin/program#schedule' })

  return { daysToCamp, milestones: milestones.slice(0, 3) }
}

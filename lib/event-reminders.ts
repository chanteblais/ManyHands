import { tenantDb } from '@/lib/tenant-db'
import type { ReminderItem } from '@/lib/send-email'

// Collects who should get a gathering/shift reminder for a given calendar date,
// batched per member. Shared by the twice-daily reminder cron
// (app/api/cron/event-reminders). "A date" is a local YYYY-MM-DD; the cron
// resolves "today"/"tomorrow" in the camp's timezone (see pacificDate below).
//
// Glåüm-specific: the camp runs on Pacific time. Logged in the generalizability
// log — a multi-tenant build would read this from tenant config.
const CAMP_TZ = 'America/Vancouver'

/** YYYY-MM-DD for `today + offsetDays` in the camp's timezone. */
export function campDate(offsetDays = 0, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + offsetDays * 86_400_000)
  // en-CA formats as YYYY-MM-DD; the timeZone makes it the camp-local date.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(shifted)
}

/** "Sat, Jul 22" from a YYYY-MM-DD (parsed at noon UTC to avoid TZ off-by-one). */
function prettyDate(ymd: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${ymd}T12:00:00Z`))
}

/** "Sat, Jul 22 · 7:00 PM" when a time is present, else just the date. */
export function whenText(ymd: string, time: string | null | undefined): string {
  const d = prettyDate(ymd)
  return time ? `${d} · ${time}` : d
}

export type ReminderRecipient = {
  clerkUserId: string
  email: string | null
  name: string
  kind: 'member' | 'volunteer'
  items: ReminderItem[]
}

type ShiftJoin = {
  clerk_user_id: string
  occurrence_date: string | null
  schedule_events: {
    id: string; title: string; time: string | null; start_time: string | null
    event_date: string | null; visible: boolean
  } | null
}

/**
 * Every gathering + shift falling on `targetDate`, grouped by the member who's
 * committed to it (RSVP'd gathering, or held shift occurrence). Returns one entry
 * per member with all their items for that date. Resolves member identity and
 * filters to approved, non-suspended members (a suspended member's commitments
 * are already released, but we guard anyway).
 */
export async function collectEventReminders(communityId: string, targetDate: string): Promise<ReminderRecipient[]> {
  const db = tenantDb(communityId)
  // Gatherings on the date + their RSVPs; and shift holds on the date (both the
  // per-night occurrence rows and non-recurring single holds whose event is dated
  // that day). Independent — one batch.
  const [gatheringsRes, occRes, singleRes] = await Promise.all([
    db
      .from('lead_up_events')
      .select('id, title, start_time, location, event_date, visible, lead_up_event_rsvps(clerk_user_id)')
      .eq('event_date', targetDate)
      .eq('visible', true),
    // Recurring nights: the signup names its date.
    db
      .from('member_shift_signups')
      .select('clerk_user_id, occurrence_date, schedule_events(id, title, time, start_time, event_date, visible)')
      .eq('occurrence_date', targetDate),
    // Non-recurring single holds: occurrence_date NULL, event dated that day.
    db
      .from('member_shift_signups')
      .select('clerk_user_id, occurrence_date, schedule_events(id, title, time, start_time, event_date, visible)')
      .is('occurrence_date', null),
  ])

  // clerkUserId → items
  const byMember = new Map<string, ReminderItem[]>()
  const push = (cid: string, item: ReminderItem) => {
    const arr = byMember.get(cid) ?? []
    arr.push(item)
    byMember.set(cid, arr)
  }

  for (const g of gatheringsRes.data ?? []) {
    const rsvps = (g.lead_up_event_rsvps as unknown as { clerk_user_id: string }[]) ?? []
    for (const r of rsvps) {
      push(r.clerk_user_id, {
        kind: 'gathering',
        title: g.title,
        whenText: whenText(targetDate, g.start_time),
        href: '/schedule',
      })
    }
  }

  const addShift = (row: ShiftJoin) => {
    const ev = row.schedule_events
    if (!ev || !ev.visible) return
    push(row.clerk_user_id, {
      kind: 'shift',
      title: ev.title,
      whenText: whenText(targetDate, ev.time ?? ev.start_time),
      href: '/schedule',
    })
  }
  for (const row of (occRes.data ?? []) as unknown as ShiftJoin[]) addShift(row)
  for (const row of (singleRes.data ?? []) as unknown as ShiftJoin[]) {
    if (row.schedule_events?.event_date === targetDate) addShift(row)
  }

  if (byMember.size === 0) return []

  // Resolve identity + gate: approved non-suspended members, or active
  // volunteers (volunteers hold shifts too — migration-free, keyed by the same
  // clerk_user_id). A member row wins when both exist.
  const ids = Array.from(byMember.keys())
  const [{ data: members }, { data: volunteers }] = await Promise.all([
    db
      .from('members')
      .select('clerk_user_id, email, first_name, preferred_name, status, suspended_at')
      .in('clerk_user_id', ids),
    db
      .from('volunteers')
      .select('clerk_user_id, email, first_name, preferred_name, status')
      .in('clerk_user_id', ids),
  ])
  const memberByClerk = new Map((members ?? []).map(m => [m.clerk_user_id, m]))
  const volunteerByClerk = new Map((volunteers ?? []).map(v => [v.clerk_user_id, v]))

  const out: ReminderRecipient[] = []
  for (const [clerkUserId, items] of Array.from(byMember)) {
    const m = memberByClerk.get(clerkUserId)
    if (m) {
      if (m.status !== 'approved' || m.suspended_at) continue
      out.push({
        clerkUserId,
        email: m.email ?? null,
        name: m.preferred_name || m.first_name || 'there',
        kind: 'member',
        items,
      })
      continue
    }
    const v = volunteerByClerk.get(clerkUserId)
    if (!v || v.status !== 'active') continue
    out.push({
      clerkUserId,
      email: v.email ?? null,
      name: v.preferred_name || v.first_name || 'there',
      kind: 'volunteer',
      // /schedule is member-gated (redirects volunteers to /profile); their
      // shift home is /participate — same target the confirmation email uses.
      items: items.map(it => it.href === '/schedule' ? { ...it, href: '/participate' } : it),
    })
  }
  return out
}

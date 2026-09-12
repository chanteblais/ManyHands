import { tenantDb } from './tenant-db'
import { getPageContent } from './page-content'
import { shiftDurationHours } from './shift-hours'
import { parseAttunementTasks } from './site-config'
import { eventRangeDays, shiftOccurrenceCount, shiftOccurrenceDates } from './shift-occurrences'
import { fetchShiftHolds } from './shift-signups'
import { getSuspendedClerkUserIds, isSuspended } from './admin-counts'

// Community-wide shift-hours rollup for the admin Overview, built from shift
// events' real durations × member_shift_signups (the single source of shift
// holds since migration 065).
//
// A recurring shift EVENT is treated as one regular shift PER occurrence — its
// listed recurrence_days, or every day of the configured event range (same
// rules as the schedule calendar, lib/shift-occurrences.ts), so "8 shifts" here
// matches what the calendar shows. Each signup carries occurrence_date, so
// coverage is EXACT: an occurrence is covered iff someone holds that night, and
// empty shifts = occurrences with nobody on them (no estimation).
//
// The section is framed as the organizer's supply-vs-demand ledger:
//   PROMISED (supply) — what members collectively owe by requirement: the
//     universal attunement 'shift' tasks (every approved, non-suspended member)
//     merged with group/role requirements (required_shift_type_id +
//     required_shift_hours), max per type per member, mirroring attunement's
//     rule (being in two things that both want teardown means the bigger ask,
//     not both). Suspended members are excluded — same rule as the attunement
//     nudge (lib/attunement-nudge.ts) and Overview's other participation
//     counts (lib/admin-counts.ts); a released commitment shouldn't still
//     read as "owed" here (bug fixed in the Tier B4 counts unification).
//   TO FILL (demand) — spot-hours the schedule opens: occurrences × duration
//     × capacity, counted ONLY for shifts with a set capacity (an uncapped
//     shift has no defined demand, so it's reported as a count, never hours).
//   FILLED (booked) and EMPTY SHIFTS (gaps) — as above.
// No duration-only "scheduled hours" total: a 3h shift with 5 spots is 15h of
// work, so summing bare durations reads as neither supply nor demand.

export type ShiftTypeHours = {
  id: string | null // null = events whose shift type was deleted
  name: string
  paletteIndex: number // slot in SHIFT_HUES (registry sort position); -1 = untyped
  slotCount: number
  cappedSlots: number // shifts (occurrences) with a set capacity
  emptySlots: number // shifts of this type with zero signups
  signupCount: number
  filledHours: number // Σ over signups of the slot's duration (people-hours)
  toFillHours: number // Σ over capped shifts of occurrences × duration × capacity
  promisedHours: number // Σ over approved members of the hours they owe of this type
  promisedMembers: number // approved members owing ≥1h of this type
}

export type ShiftHoursOverview = {
  totalPromisedHours: number
  totalToFillHours: number
  totalFilledHours: number
  totalSignups: number
  memberCount: number // distinct members holding ≥1 shift
  approvedMemberCount: number // approved, non-suspended members the promised math ranges over
  slotCount: number
  cappedSlots: number
  emptySlots: number
  types: ShiftTypeHours[]
}

export async function getShiftHoursOverview(communityId: string): Promise<ShiftHoursOverview> {
  const db = tenantDb(communityId)
  const [
    { data: shiftTypes },
    { data: events },
    signups,
    config,
    { data: approvedRows },
    suspendedClerkIds,
    { data: groupRows },
    { data: groupMemberRows },
    { data: roleRows },
    { data: roleHolderRows },
  ] = await Promise.all([
    db.from('shift_types').select('id, name, sort_order').order('sort_order'),
    db
      .from('schedule_events')
      .select('id, shift_type_id, start_time, end_time, capacity, event_date, is_recurring, recurrence_days')
      .eq('participation_type', 'shift'),
    // Shared with the Manage-side roster (lib/admin-program-data.ts
    // getAdminRosters) so "who holds this shift" can never disagree.
    fetchShiftHolds(communityId),
    getPageContent(communityId, ['config_event_start_date', 'config_event_end_date', 'config_attunement_tasks']),
    db.from('applications').select('clerk_user_id').eq('status', 'approved').not('clerk_user_id', 'is', null),
    // Shared with Manage + Overview's other counts (lib/admin-counts.ts).
    getSuspendedClerkUserIds(communityId),
    db.from('groups').select('id, required_shift_type_id, required_shift_hours').not('required_shift_type_id', 'is', null),
    db.from('group_members').select('clerk_user_id, group_id'),
    db.from('roles').select('id, required_shift_type_id, required_shift_hours').not('required_shift_type_id', 'is', null),
    db
      .from('camp_signups')
      .select('clerk_user_id, role_id, role_approval_status')
      .not('role_id', 'is', null),
  ])

  const rangeDays = eventRangeDays(config['config_event_start_date'], config['config_event_end_date'])

  const eventById = new Map((events ?? []).map(e => [e.id as string, e]))

  // Occurrence identity: an occurrence is one (event, night). A signup names its
  // night via occurrence_date (NULL = the single occurrence of a non-recurring
  // shift); occKey collapses that to a stable string.
  const occKey = (eventId: string, date: string | null) => `${eventId}::${date ?? ''}`
  const holdersByOcc = new Map<string, Set<string>>()
  for (const s of signups.map(r => ({ ...r, occurrence_date: r.occurrence_date as string | null }))) {
    if (!s.schedule_event_id || !eventById.has(s.schedule_event_id)) continue
    const key = occKey(s.schedule_event_id, s.occurrence_date)
    const set = holdersByOcc.get(key) ?? new Set<string>()
    set.add(s.clerk_user_id)
    holdersByOcc.set(key, set)
  }

  const members = new Set<string>()
  for (const set of Array.from(holdersByOcc.values())) for (const u of Array.from(set)) members.add(u)

  type Bucket = Omit<ShiftTypeHours, 'id' | 'name' | 'paletteIndex'>
  const buckets = new Map<string | null, Bucket>()
  const bucketFor = (typeId: string | null): Bucket => {
    let b = buckets.get(typeId)
    if (!b) {
      b = { slotCount: 0, cappedSlots: 0, emptySlots: 0, signupCount: 0, filledHours: 0, toFillHours: 0, promisedHours: 0, promisedMembers: 0 }
      buckets.set(typeId, b)
    }
    return b
  }

  // Each occurrence is a regular shift: iterate the concrete nights and count
  // its holders exactly (coverage, empties, filled hours — no estimation).
  for (const ev of events ?? []) {
    const b = bucketFor(ev.shift_type_id ?? null)
    const h = shiftDurationHours(ev.start_time, ev.end_time)
    const dates = shiftOccurrenceDates(ev, rangeDays)
    // "Every day" recurring with no configured range → count as 1 abstract slot.
    const occDates: (string | null)[] = ev.is_recurring
      ? (dates.length > 0 ? dates : [])
      : [ev.event_date ? ev.event_date : null]
    const occCount = ev.is_recurring ? shiftOccurrenceCount(ev, rangeDays) : 1
    // Iterate real nights when we have them; otherwise fall back to occCount
    // abstract slots (an unconfigured "every day" shift) with no holders.
    const iterable: (string | null)[] = occDates.length > 0 ? occDates : new Array(occCount).fill(null)
    for (const date of iterable) {
      // Non-recurring signups key on NULL; recurring on the night.
      const holders = holdersByOcc.get(occKey(ev.id as string, ev.is_recurring ? date : null))?.size ?? 0
      b.slotCount += 1
      b.signupCount += holders
      b.filledHours += h * holders
      if (holders === 0) b.emptySlots += 1
      if (ev.capacity != null && ev.capacity > 0) {
        b.cappedSlots += 1
        b.toFillHours += h * ev.capacity // capacity is per occurrence
      }
    }
  }

  // ── Promised hours ─────────────────────────────────────────────────────────
  // Universal typed 'shift' attunement tasks apply to every approved member.
  const universalOwed = new Map<string, number>()
  for (const t of parseAttunementTasks(config['config_attunement_tasks'])) {
    if (t.enabled && t.requirement === 'shift' && t.shiftTypeId) {
      universalOwed.set(t.shiftTypeId, Math.max(universalOwed.get(t.shiftTypeId) ?? 0, t.requiredHours ?? 1))
    }
  }

  type Req = { typeId: string; hours: number }
  const reqOf = (r: { required_shift_type_id: string | null; required_shift_hours: number | null }): Req | null =>
    r.required_shift_type_id && r.required_shift_hours && r.required_shift_hours > 0
      ? { typeId: r.required_shift_type_id, hours: r.required_shift_hours }
      : null
  const groupReq = new Map((groupRows ?? []).flatMap(g => { const r = reqOf(g); return r ? [[g.id as string, r] as const] : [] }))
  const roleReq = new Map((roleRows ?? []).flatMap(r => { const q = reqOf(r); return q ? [[r.id as string, q] as const] : [] }))

  const groupsByUser = new Map<string, string[]>()
  for (const gm of groupMemberRows ?? []) {
    const list = groupsByUser.get(gm.clerk_user_id) ?? []
    list.push(gm.group_id as string)
    groupsByUser.set(gm.clerk_user_id, list)
  }
  // Role requirement only counts once the role is actually held (not pending).
  const roleByUser = new Map<string, string>()
  for (const cs of roleHolderRows ?? []) {
    if (cs.role_approval_status !== 'pending') roleByUser.set(cs.clerk_user_id, cs.role_id as string)
  }

  // Suspended members have released every commitment (063) — they owe nothing
  // while paused, same rule as the attunement nudge. Bug fix: this used to
  // range over every approved member regardless of suspension, so a paused
  // member's requirement still inflated "Hours Promised" even though the
  // Participation section above already excluded them.
  const promisedRows = (approvedRows ?? []).filter(a => !isSuspended(a.clerk_user_id, suspendedClerkIds))

  for (const a of promisedRows) {
    const userId = a.clerk_user_id as string
    const owed = new Map(universalOwed)
    const raise = (r: Req | undefined | null) => {
      if (r) owed.set(r.typeId, Math.max(owed.get(r.typeId) ?? 0, r.hours))
    }
    for (const gid of groupsByUser.get(userId) ?? []) raise(groupReq.get(gid))
    raise(roleReq.get(roleByUser.get(userId) ?? ''))
    for (const [typeId, hours] of Array.from(owed.entries())) {
      const b = bucketFor(typeId)
      b.promisedHours += hours
      b.promisedMembers++
    }
  }

  // Registry order (= palette order), untyped bucket last; a type appears if it
  // has shift events OR promised hours (a requirement with nothing scheduled
  // yet should still show).
  const round = (n: number) => Math.round(n * 100) / 100
  const types: ShiftTypeHours[] = []
  const push = (id: string | null, name: string, paletteIndex: number, b: Bucket) =>
    types.push({
      id, name, paletteIndex, ...b,
      filledHours: round(b.filledHours),
      toFillHours: round(b.toFillHours),
      promisedHours: round(b.promisedHours),
    })
  ;(shiftTypes ?? []).forEach((t, i) => {
    const b = buckets.get(t.id as string)
    if (b) push(t.id as string, t.name as string, i, b)
  })
  const untyped = buckets.get(null)
  if (untyped) push(null, 'Untyped', -1, untyped)

  return {
    totalPromisedHours: round(types.reduce((a, t) => a + t.promisedHours, 0)),
    totalToFillHours: round(types.reduce((a, t) => a + t.toFillHours, 0)),
    totalFilledHours: round(types.reduce((a, t) => a + t.filledHours, 0)),
    totalSignups: types.reduce((a, t) => a + t.signupCount, 0),
    memberCount: members.size,
    approvedMemberCount: promisedRows.length,
    slotCount: types.reduce((a, t) => a + t.slotCount, 0),
    cappedSlots: types.reduce((a, t) => a + t.cappedSlots, 0),
    emptySlots: types.reduce((a, t) => a + t.emptySlots, 0),
    types,
  }
}

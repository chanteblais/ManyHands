import { tenantDb } from './tenant-db'
import { getPageContent, getPageContentValue } from './page-content'
import { shiftDurationHours } from './shift-hours'
import { getMemberShiftState } from './shift-attunement'
import { parseAttunementTasks } from './site-config'
import { memberDisplayNames } from './member-names'
import { eventRangeDays, shiftOccurrenceDates } from './shift-occurrences'

// Data assembly for the Participate page, shared by the API routes and the
// server-rendered page (mirrors lib/inbox.ts for messages). The page calls
// these directly so every section renders with its data already in place —
// no client fetch-after-hydration waterfall; the API routes remain the
// client's refresh path after a signup/join action.

// ── Roles (/api/signup GET) ───────────────────────────────────────────────────

export type RoleSignupData = {
  signup: { role_id: string | null; role_approval_status: string | null } | null
  departments: unknown[]
  shiftSignupOpen: boolean
}

export async function getRoleSignupData(communityId: string, userId: string): Promise<RoleSignupData> {
  const db = tenantDb(communityId)
  const [deptRes, rolesRes, signupRes, roleCounts, shiftFlagValue] = await Promise.all([
    db.from('departments').select('id, name, description, icon, sort_order').order('sort_order'),
    db.from('roles').select('id, name, description, capacity, sort_order, department_id, purpose, responsibilities_before, responsibilities_during, ideal_for, commitment, commitment_period, requires_approval').order('sort_order'),
    db.from('camp_signups').select('role_id, role_approval_status').eq('clerk_user_id', userId).maybeSingle(),
    db.from('camp_signups').select('role_id').not('role_id', 'is', null),
    getPageContentValue(communityId, 'config_shift_signup_open'),
  ])

  const shiftSignupOpen = shiftFlagValue !== 'false'

  const roleSignupCounts: Record<string, number> = {}
  for (const row of roleCounts.data ?? []) {
    if (row.role_id) roleSignupCounts[row.role_id] = (roleSignupCounts[row.role_id] ?? 0) + 1
  }

  const rolesWithCounts = (rolesRes.data ?? []).map(r => ({
    ...r,
    signed_up: roleSignupCounts[r.id] ?? 0,
  }))

  const departments = (deptRes.data ?? []).map(d => ({
    ...d,
    roles: rolesWithCounts.filter(r => r.department_id === d.id),
  }))

  return {
    signup: signupRes.data ?? null,
    departments,
    shiftSignupOpen,
  }
}

// ── Shifts (/api/shift-signups GET) ───────────────────────────────────────────

// A hold is keyed per (member, event, occurrence) — each night of a recurring
// shift is its own regular shift. occKey collapses the occurrence to a string
// (empty = a non-recurring shift's single occurrence).
export const holdOccKey = (userId: string, eventId: string, occDate: string | null) =>
  `${userId}|${eventId}|${occDate ?? ''}`

// Unique (member, event, occurrence) holds from member_shift_signups (the
// single source of shift holds since the legacy column drop, migration 065).
export async function fetchAllHolds(communityId: string) {
  const db = tenantDb(communityId)
  const { data: many } = await db
    .from('member_shift_signups')
    .select('clerk_user_id, schedule_event_id, occurrence_date, role')
  const pairs = new Set<string>()
  // leads keyed by (event, occurrence) so a lead is scoped to the night held.
  const leadsByOcc = new Map<string, string[]>()
  // Every holder (member id) on each (event, occurrence), deduped — backs the
  // roster shown on the shift cards + confirm modal. Same key as leadsByOcc.
  const holdersByOcc = new Map<string, Set<string>>()
  const addHolder = (eventId: string, date: string | null, uid: string) => {
    const k = `${eventId}|${date ?? ''}`
    const set = holdersByOcc.get(k) ?? new Set<string>()
    set.add(uid)
    holdersByOcc.set(k, set)
  }
  for (const r of many ?? []) {
    if (!r.schedule_event_id) continue
    const date = (r.occurrence_date as string | null) ?? null
    pairs.add(holdOccKey(r.clerk_user_id, r.schedule_event_id, date))
    addHolder(r.schedule_event_id, date, r.clerk_user_id)
    if (r.role === 'lead') {
      const k = `${r.schedule_event_id}|${date ?? ''}`
      leadsByOcc.set(k, [...(leadsByOcc.get(k) ?? []), r.clerk_user_id])
    }
  }
  return { pairs, leadsByOcc, holdersByOcc }
}

// Holds on one specific occurrence (event + night). occDate null = the single
// occurrence of a non-recurring shift.
export const countHoldsFor = (pairs: Set<string>, eventId: string, occDate: string | null) => {
  const suffix = `|${eventId}|${occDate ?? ''}`
  let n = 0
  pairs.forEach(p => { if (p.endsWith(suffix)) n++ })
  return n
}

export type ShiftSignupData = {
  shifts: unknown[]
  owed: { shiftTypeId: string; requiredHours: number; heldHours: number }[]
  shiftTypes: { id: string; name: string; icon: string | null; color_index: number }[]
  shiftSignupOpen: boolean
}

export async function getShiftSignupData(communityId: string, userId: string): Promise<ShiftSignupData> {
  const db = tenantDb(communityId)
  const [eventsRes, holds, shiftState, config, typesRes] = await Promise.all([
    db
      .from('schedule_events')
      .select('id, title, subtitle, day, time, event_date, start_time, end_time, capacity, shift_type_id, needs_lead, is_recurring, recurrence_days, shift_types(name, icon)')
      .eq('participation_type', 'shift')
      .eq('visible', true)
      .order('event_date', { ascending: true, nullsFirst: false })
      .order('start_time', { ascending: true, nullsFirst: false }),
    fetchAllHolds(communityId),
    getMemberShiftState(communityId, userId),
    getPageContent(communityId, ['config_shift_signup_open', 'config_attunement_tasks', 'config_event_start_date', 'config_event_end_date']),
    db.from('shift_types').select('id, name, icon').order('sort_order'),
  ])

  // Registry order drives each type's palette slot (lib/shift-colors.ts).
  const shiftTypes = (typesRes.data ?? []).map((t, i) => ({ id: t.id, name: t.name, icon: t.icon, color_index: i }))

  const shiftSignupOpen = config['config_shift_signup_open'] !== 'false'
  const rangeDays = eventRangeDays(config['config_event_start_date'], config['config_event_end_date'])

  // Resolve names for every holder once (leads are a subset) — both the "Led
  // by …" line and the full signed-up roster read from this one map.
  const holderNames = await memberDisplayNames(
    communityId,
    Array.from(holds.holdersByOcc.values()).flatMap(s => Array.from(s)),
  )

  // Each occurrence is a regular shift: a non-recurring event yields one slot
  // (occurrence_date null); a recurring event yields one slot per night, each
  // with its own holds/capacity/lead. A slot's composite id is eventId::date.
  const shifts = (eventsRes.data ?? []).flatMap(e => {
    const st = e.shift_types as unknown as { name?: string; icon?: string | null } | null
    const duration = shiftDurationHours(e.start_time, e.end_time)
    // Recurring → one slot per night (occurrence_date = the night). Non-recurring
    // → one slot with occurrence_date NULL (that's how its hold is keyed + what
    // the API validates); its calendar column comes from event_date below.
    const dates: (string | null)[] = e.is_recurring
      ? shiftOccurrenceDates(e, rangeDays)
      : [null]
    return dates.map(occDate => {
      const leadKey = `${e.id}|${occDate ?? ''}`
      const leadIds = holds.leadsByOcc.get(leadKey) ?? []
      const held = holds.pairs.has(holdOccKey(userId, e.id, occDate))
      // Named holders on this night — leads first, then alphabetical; the
      // caller (self) is flagged so the UI can mark "you". Unnamed holders
      // (no member row) fall out; the signed_up count stays authoritative.
      const roster = Array.from(holds.holdersByOcc.get(leadKey) ?? [])
        .map(id => ({ name: holderNames[id], isLead: leadIds.includes(id), isSelf: id === userId }))
        .filter(r => r.name)
        .sort((a, b) => (a.isLead === b.isLead ? a.name.localeCompare(b.name) : a.isLead ? -1 : 1))
      return {
        id: occDate ? `${e.id}::${occDate}` : e.id,
        schedule_event_id: e.id,
        occurrence_date: occDate,
        title: e.title,
        subtitle: e.subtitle,
        day: e.day,
        time: e.time,
        // 24h start ("HH:MM") kept for chronological sort within a day column —
        // the display `time` is 12-hour and awkward to order by.
        start_time: e.start_time ?? null,
        // The night this slot represents drives its calendar column.
        event_date: e.is_recurring ? occDate : (e.event_date ?? null),
        duration_hours: duration,
        capacity: e.capacity,
        signed_up: countHoldsFor(holds.pairs, e.id, occDate),
        shift_type_id: e.shift_type_id,
        shift_type_name: st?.name ?? 'Shift',
        shift_type_icon: st?.icon ?? null,
        held,
        held_role: held ? (leadIds.includes(userId) ? 'lead' : 'member') : null,
        lead_names: leadIds.map(id => holderNames[id]).filter(Boolean),
        roster,
        needs_lead: e.needs_lead ?? false,
      }
    })
  })

  // Chronological within each day column: expanding recurring events into
  // per-night occurrences interleaves them by source event, which floated a
  // late-night shift above an earlier-afternoon one in the same column. Sort by
  // date then 24h start (both zero-padded, so lexical compare is chronological);
  // undated/untimed slots sink last.
  shifts.sort((a, b) => {
    const d = (a.event_date ?? '9999-99-99').localeCompare(b.event_date ?? '9999-99-99')
    if (d !== 0) return d
    return (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99')
  })

  // Owed requirements = derived (groups/roles) merged with universal typed shift
  // attunement tasks — max hours per shift type, mirroring attunement's rule.
  const owedByType = new Map<string, number>()
  for (const r of shiftState.derivedShiftRequirements) {
    owedByType.set(r.shiftTypeId, Math.max(owedByType.get(r.shiftTypeId) ?? 0, r.requiredHours))
  }
  for (const t of parseAttunementTasks(config['config_attunement_tasks'])) {
    if (t.enabled && t.requirement === 'shift' && t.shiftTypeId) {
      owedByType.set(t.shiftTypeId, Math.max(owedByType.get(t.shiftTypeId) ?? 0, t.requiredHours ?? 1))
    }
  }
  const owed = Array.from(owedByType.entries()).map(([shiftTypeId, requiredHours]) => ({
    shiftTypeId,
    requiredHours,
    heldHours: shiftState.hoursByShiftType[shiftTypeId] ?? 0,
  }))

  return { shifts, owed, shiftTypes, shiftSignupOpen }
}

// ── Self-join groups (/api/groups/membership GET) ─────────────────────────────

// Member-facing self-service for opt-in groups (e.g. Setup / Teardown / Decor).
// A group is self-joinable iff its collection has self_join = true (migration
// 044) — a single collection-level gate; profile display (show_on_profile) is
// an independent concern. Groups with no collection are not self-joinable.

export type SelfJoinGroup = {
  id: string
  name: string
  description: string | null
  icon: string | null
  icon_image: string | null
  collection_id: string | null
  collection_name: string | null
  collection_sort: number
  joined: boolean
  shift_commitment: { hours: number; type: string } | null
}

type SelfJoinGroupRow = {
  id: string
  name: string
  description: string | null
  icon: string | null
  icon_image: string | null
  collection_id: string | null
  required_shift_hours: number | null
  // Supabase types the embeds as arrays; runtime returns a single row for a to-one FK.
  group_collections: { name: string; sort_order: number; self_join: boolean } | { name: string; sort_order: number; self_join: boolean }[] | null
  shift_types: { name: string } | { name: string }[] | null
}

export async function getSelfJoinGroups(communityId: string, userId: string): Promise<SelfJoinGroup[]> {
  const db = tenantDb(communityId)
  // One round-trip: the groups query embeds its collection's self_join flag
  // (so no separate selectable-ids pass) and the caller's memberships are
  // independent of it.
  const [groupsRes, mineRes] = await Promise.all([
    db
      .from('groups')
      .select('id, name, description, icon, icon_image, sort_order, collection_id, required_shift_hours, group_collections(name, sort_order, self_join), shift_types:required_shift_type_id(name)')
      .order('sort_order', { ascending: true }),
    db.from('group_members').select('group_id').eq('clerk_user_id', userId),
  ])

  // Table missing (pre-migration) → nothing selectable rather than a 500.
  if (groupsRes.error) return []
  const joined = new Set((mineRes.data ?? []).map(m => m.group_id))

  return ((groupsRes.data ?? []) as unknown as SelfJoinGroupRow[])
    .map(g => {
      const col = Array.isArray(g.group_collections) ? g.group_collections[0] : g.group_collections
      const shiftType = Array.isArray(g.shift_types) ? g.shift_types[0] : g.shift_types
      return { g, col, shiftType }
    })
    .filter(({ col }) => col?.self_join)
    .map(({ g, col, shiftType }) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      icon: g.icon,
      icon_image: g.icon_image,
      collection_id: g.collection_id,
      collection_name: col?.name ?? null,
      collection_sort: col?.sort_order ?? 0,
      joined: joined.has(g.id),
      // The shift commitment joining this group carries (null = none) — shown
      // on the row so members know what they're taking on before they join.
      shift_commitment: shiftType ? { hours: g.required_shift_hours ?? 1, type: shiftType.name } : null,
    }))
    // Order by collection, keeping the existing within-collection sort_order (stable sort).
    .sort((a, b) => a.collection_sort - b.collection_sort)
}

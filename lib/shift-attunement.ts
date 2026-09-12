import { tenantDb } from '@/lib/tenant-db'
import { shiftDurationHours } from '@/lib/shift-hours'

// Server-side helper: everything attunement needs to evaluate shift-hours
// requirements for one member. Shared by the home dashboard (app/page.tsx) and
// the profile checklist (app/profile/page.tsx) so both derive identical state.
//
// A member's owed shift requirements come from two authored places:
//   · universal  — attunement tasks with requirement 'shift' (+ shiftTypeId/hours),
//                  evaluated inside buildAttunementChecklist against hoursByShiftType
//   · conditional — groups/roles they hold that carry required_shift_type_id +
//                  required_shift_hours, returned here as derived requirements
//                  (they become extra checklist lines)

export type DerivedShiftRequirement = {
  id: string            // stable checklist id, e.g. 'shift-group-<uuid>'
  label: string         // e.g. "Teardown Shift"
  shiftTypeId: string
  requiredHours: number
}

export type MemberShiftState = {
  hasShift: boolean
  hoursByShiftType: Record<string, number>
  totalShiftHours: number
  derivedShiftRequirements: DerivedShiftRequirement[]
}

// For logged-out / no-member contexts where there's nothing to look up.
export const EMPTY_MEMBER_SHIFT_STATE: MemberShiftState = {
  hasShift: false,
  hoursByShiftType: {},
  totalShiftHours: 0,
  derivedShiftRequirements: [],
}

type ReqRow = {
  required_shift_type_id: string | null
  required_shift_hours: number | null
  shift_types: { name: string } | null
}

export async function getMemberShiftState(communityId: string, clerkUserId: string): Promise<MemberShiftState> {
  const db = tenantDb(communityId)
  const [signupsRes, roleRes, groupRes] = await Promise.all([
    // Held shifts (member_shift_signups — the single source since 065).
    // occurrence_date names each held night — every night of a recurring shift
    // counts its own hours (it's a regular shift).
    db
      .from('member_shift_signups')
      .select('schedule_event_id, occurrence_date')
      .eq('clerk_user_id', clerkUserId),
    // The member's role (which may carry a requirement).
    db
      .from('camp_signups')
      .select('role_id, role_approval_status, roles(required_shift_type_id, required_shift_hours, shift_types:required_shift_type_id(name))')
      .eq('clerk_user_id', clerkUserId)
      .maybeSingle(),
    // Groups the member belongs to, with their optional requirement.
    db
      .from('group_members')
      .select('groups(id, required_shift_type_id, required_shift_hours, shift_types:required_shift_type_id(name))')
      .eq('clerk_user_id', clerkUserId),
  ])

  // ── Hours held ─────────────────────────────────────────────────────────────
  // Held OCCURRENCES, keyed (event, night). A recurring shift held for 2 nights
  // is 2 occurrences = 2× hours.
  const heldOcc = new Map<string, string>() // `${eventId}|${date??''}` → eventId
  for (const r of signupsRes.data ?? []) {
    if (r.schedule_event_id) heldOcc.set(`${r.schedule_event_id}|${(r.occurrence_date as string | null) ?? ''}`, r.schedule_event_id)
  }
  const eventIds = new Set(Array.from(heldOcc.values()))

  const hoursByShiftType: Record<string, number> = {}
  let totalShiftHours = 0
  if (eventIds.size > 0) {
    const { data: events } = await db
      .from('schedule_events')
      .select('id, participation_type, shift_type_id, start_time, end_time')
      .in('id', Array.from(eventIds))
    const meta = new Map<string, { typeId: string; h: number }>()
    for (const ev of events ?? []) {
      if (ev.participation_type !== 'shift' || !ev.shift_type_id) continue
      const h = shiftDurationHours(ev.start_time, ev.end_time)
      if (h <= 0) continue
      meta.set(ev.id as string, { typeId: ev.shift_type_id as string, h })
    }
    // One count per held occurrence (per night), not per distinct event.
    for (const eventId of Array.from(heldOcc.values())) {
      const m = meta.get(eventId)
      if (!m) continue
      hoursByShiftType[m.typeId] = (hoursByShiftType[m.typeId] ?? 0) + m.h
      totalShiftHours += m.h
    }
  }

  // ── Derived requirements from groups + role ───────────────────────────────
  // One line per shift type; overlapping sources keep the LARGEST hours (being
  // in two things that both want teardown means you owe the bigger ask, not both).
  const byType = new Map<string, { label: string; requiredHours: number; sourceId: string }>()

  const addReq = (row: ReqRow | null | undefined, sourceId: string) => {
    if (!row?.required_shift_type_id || !row.required_shift_hours || row.required_shift_hours <= 0) return
    const existing = byType.get(row.required_shift_type_id)
    if (existing && existing.requiredHours >= row.required_shift_hours) return
    byType.set(row.required_shift_type_id, {
      label: `${row.shift_types?.name ?? 'Shift'} Shift`,
      requiredHours: row.required_shift_hours,
      sourceId,
    })
  }

  for (const gm of groupRes.data ?? []) {
    addReq(gm.groups as unknown as ReqRow, `group-${(gm.groups as unknown as { id?: string })?.id ?? 'unknown'}`)
  }
  // Role requirement only counts once the role is actually held (not pending).
  if (roleRes.data?.role_id && roleRes.data.role_approval_status !== 'pending') {
    addReq(roleRes.data.roles as unknown as ReqRow, `role-${roleRes.data.role_id}`)
  }

  const derivedShiftRequirements: DerivedShiftRequirement[] = Array.from(byType.entries()).map(
    ([shiftTypeId, r]) => ({ id: `shift-${r.sourceId}`, label: r.label, shiftTypeId, requiredHours: r.requiredHours })
  )

  return {
    hasShift: eventIds.size > 0,
    hoursByShiftType,
    totalShiftHours,
    derivedShiftRequirements,
  }
}

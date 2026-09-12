import { tenantDb } from './tenant-db'

// clerk_user_id → a schedule_event_id they hold (any one of them). Reads
// member_shift_signups — the single source of shift holds since the legacy
// camp_signups column drop (migration 065). Shared by the Manage and Overview
// admin pages so "has a shift" means the same thing on both.
export async function getShiftEventByUser(communityId: string): Promise<Record<string, string | null>> {
  const db = tenantDb(communityId)
  const { data: multiSignupsRaw } = await db
    .from('member_shift_signups')
    .select('clerk_user_id, schedule_event_id')
  const map: Record<string, string | null> = {}
  for (const s of multiSignupsRaw ?? []) {
    if (s.schedule_event_id) map[s.clerk_user_id] = s.schedule_event_id
  }
  return map
}

export type ShiftHoldRow = { clerk_user_id: string; schedule_event_id: string; occurrence_date: string | null; role: string | null }

// Raw hold rows — the one query the admin Overview (shift-hours ledger) and
// Manage (per-shift roster) share, so both build on identical hold data.
// member_shift_signups is the single source of shift holds since the legacy
// camp_signups column drop (migration 065). Callers build their own grouping
// on top (occurrence maps, role display, etc.).
export async function fetchShiftHolds(communityId: string): Promise<ShiftHoldRow[]> {
  const db = tenantDb(communityId)
  const { data } = await db
    .from('member_shift_signups')
    .select('clerk_user_id, schedule_event_id, occurrence_date, role')
  return (data ?? []) as ShiftHoldRow[]
}

import { tenantDb } from '@/lib/tenant-db'
import type { DuesAudience } from '@/lib/dues'

// One row per person the dues tracker shows (Community → Camp Dues). Server-only
// (imports tenantDb) — kept separate from the pure lib/dues.ts so the
// client-side DuesManager can import config types without pulling in server code.
export type DuesRosterRow = {
  // Row id in its own table (members.id or volunteers.id), keyed by `kind`.
  id: string
  kind: 'member' | 'volunteer'
  name: string
  email: string | null
  paidAt: string | null
  // Members only: self-reported (068) but not yet admin-confirmed → "awaiting
  // review". Always null for volunteers (they have no self-serve surface).
  reportedAt: string | null
  note: string | null
  // Suspended members (067 × 063) are shown de-emphasized and left out of the
  // counts — a paused member isn't expected to pay while away.
  suspended: boolean
}

const memberName = (m: { preferred_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null }) =>
  `${m.preferred_name || m.first_name || ''} ${m.last_name || ''}`.trim() || (m.email ?? null) || 'Member'

// Load the tracker roster for the selected audience(s). Camp members and active
// volunteers are unioned; each row carries its `kind` so mutations route to the
// right table.
export async function getDuesRoster(communityId: string, audience: DuesAudience): Promise<DuesRosterRow[]> {
  const db = tenantDb(communityId)
  const [members, volunteers] = await Promise.all([
    audience.members
      ? db
          .from('members')
          .select('id, email, first_name, last_name, preferred_name, dues_paid_at, dues_reported_at, dues_note, suspended_at')
          .eq('status', 'approved')
      : Promise.resolve({ data: [] as unknown[] }),
    audience.volunteers
      ? db
          .from('volunteers')
          .select('id, email, first_name, last_name, preferred_name, dues_paid_at, dues_note')
          .eq('status', 'active')
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const memberRows: DuesRosterRow[] = ((members.data as Record<string, unknown>[]) ?? []).map(m => ({
    id: m.id as string,
    kind: 'member',
    name: memberName(m as never),
    email: (m.email as string | null) ?? null,
    paidAt: (m.dues_paid_at as string | null) ?? null,
    reportedAt: (m.dues_reported_at as string | null) ?? null,
    note: (m.dues_note as string | null) ?? null,
    suspended: !!m.suspended_at,
  }))

  const volunteerRows: DuesRosterRow[] = ((volunteers.data as Record<string, unknown>[]) ?? []).map(v => ({
    id: v.id as string,
    kind: 'volunteer',
    name: memberName(v as never),
    email: (v.email as string | null) ?? null,
    paidAt: (v.dues_paid_at as string | null) ?? null,
    reportedAt: null,
    note: (v.dues_note as string | null) ?? null,
    suspended: false,
  }))

  return [...memberRows, ...volunteerRows]
}

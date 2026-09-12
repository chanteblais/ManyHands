// Community identity — override via env vars for each deployment.
// These drive metadata, email copy, and any UI where the community name
// appears in code rather than in page_content.

export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Glåüm'
export const EVENT_NAME = process.env.NEXT_PUBLIC_EVENT_NAME ?? 'What If 2026'
export const SITE_DESCRIPTION =
  process.env.NEXT_PUBLIC_SITE_DESCRIPTION ??
  `${SITE_NAME} Theme Camp at ${EVENT_NAME}.`

// Default acknowledgement items for the member application agreement step.
// Store an override as JSON in page_content key "member_acknowledgements".
export const DEFAULT_AGREEMENT_ITEMS: string[] = [
  'I have taken time to familiarise myself with this community and believe it is one I would genuinely enjoy contributing to.',
  'I understand this community is participatory.',
  'I will contribute honestly within my capacity.',
  'I will communicate if my plans or availability change.',
  'I will help maintain shared spaces and support the collective wellbeing of camp.',
  'I understand setup and teardown are shared responsibilities.',
  'I understand no one person is responsible for carrying the entire camp.',
  'I will treat fellow camp members, neighbours, and participants with kindness, respect, and consideration.',
  'I will leave camp better than I found it.',
]

// Default attendance options for the application form.
// Store an override as JSON in page_content key "member_attendance_options".
export const DEFAULT_ATTENDANCE_OPTIONS: string[] = [
  'Attending fully',
  'Attending partially',
  'Still figuring it out',
]

// Default membership type options (how someone relates to camp).
// Store an override as JSON in page_content key "member_membership_types".
export const DEFAULT_MEMBERSHIP_TYPE_OPTIONS: string[] = [
  'Camping on site',
  'Staying nearby but participating',
  'Mostly visiting socially',
  'Not sure yet',
]

// Copy for the apply-page track picker ("How would you like to join?") cards.
// Store an override as JSON in page_content key "config_track_picker".
export type TrackCopy = {
  memberTitle: string
  memberDesc: string
  volunteerTitle: string
  volunteerDesc: string
}

export const DEFAULT_TRACK_COPY: TrackCopy = {
  memberTitle: 'Camp Member',
  memberDesc: `Apply for full membership — fill out an application and join the community as a ${SITE_NAME} member.`,
  volunteerTitle: 'Volunteer',
  volunteerDesc: 'Sign up as a volunteer — help with setup, teardown, or other roles without a full membership application.',
}

export function parseTrackCopy(raw?: string | null): TrackCopy {
  if (!raw) return DEFAULT_TRACK_COPY
  try {
    const o = JSON.parse(raw)
    return { ...DEFAULT_TRACK_COPY, ...o }
  } catch {
    return DEFAULT_TRACK_COPY
  }
}

// ── Attunement checklist ────────────────────────────────────────────────────
// The member-facing "Attunement Status" checklist on /profile. Every item is
// admin-managed (Admin → Manage → Attunement Tasks) and tied to a requirement
// that auto-completes when the member meets it. Stored as JSON in page_content
// key "config_attunement_tasks".

// 'collection' = membership in a group collection (migration 042); the task
// carries which collection and how many memberships are required.
// 'dues' = camp dues recorded paid (migration 067). Unlike every other
// requirement it isn't derived from a member action — this year dues are
// collected by email and an admin marks each member paid (Community → Camp Dues).
export type AttunementRequirement = 'role' | 'shift' | 'collection' | 'photo' | 'approved' | 'dues'

export type AttunementTask = {
  id: string
  label: string
  requirement: AttunementRequirement
  enabled: boolean
  // Only for requirement === 'collection':
  //   collectionId  — which collection's memberships count; undefined = any
  //                   collection (member's total group count).
  //   requiredCount — how many memberships are needed to complete (default 1).
  collectionId?: string
  requiredCount?: number
  // Only for requirement === 'shift':
  //   shiftTypeId   — which shift type's hours count; undefined = any shift.
  //   requiredHours — hours of that shift type needed to complete (default 1).
  // This is the "universal" (everyone) contribution requirement — conditional
  // requirements live on groups/roles instead.
  shiftTypeId?: string
  requiredHours?: number
}

// The STATIC requirement types an admin can assign (dropdown order). The
// 'collection' and 'shift' requirements are offered dynamically in the admin UI
// (they need the live collection / shift-type lists), so they aren't listed here.
// `hint` is shown to admins; completion logic lives where the member's data is
// available (buildAttunementChecklist + app/profile & app/page).
export const ATTUNEMENT_REQUIREMENTS: { value: AttunementRequirement; label: string; hint: string }[] = [
  { value: 'role',     label: 'Role selected',        hint: 'Completes when the member has an approved role.' },
  { value: 'photo',    label: 'Photo uploaded',       hint: 'Completes when the member uploads a profile photo.' },
  { value: 'approved', label: 'Application approved',  hint: 'Always complete on the member profile — use as a reassuring first step.' },
  { value: 'dues',     label: 'Camp dues paid',       hint: 'Completes when you mark the member paid in Community → Camp Dues. Set how members pay there too.' },
]

// Requirements accepted when parsing saved config. Includes 'collection' (the
// dynamic type) and legacy 'contribution' (migrated to 'collection' on parse).
const VALID_ATTUNEMENT_REQUIREMENTS = new Set<string>([
  ...ATTUNEMENT_REQUIREMENTS.map(r => r.value),
  'collection',
  'contribution',
  'shift', // offered dynamically (per shift type) rather than in the static list
])

// Default checklist — mirrors the original hardcoded list so behaviour is
// unchanged until an admin edits it. The old "Contribution Selected" task is now
// an any-collection membership task (collectionId undefined ⇒ counts all groups),
// which completes exactly as before (member belongs to ≥ 1 group).
export const DEFAULT_ATTUNEMENT_TASKS: AttunementTask[] = [
  { id: 'approved',     label: 'Application Approved',   requirement: 'approved',   enabled: true },
  { id: 'photo',        label: 'Photo Uploaded',         requirement: 'photo',      enabled: true },
  { id: 'contribution', label: 'Contribution Selected',  requirement: 'collection', enabled: true, requiredCount: 1 },
  { id: 'role',         label: 'Role Selected',          requirement: 'role',       enabled: true },
  { id: 'shift',        label: 'Shift Assigned',         requirement: 'shift',      enabled: true },
]

// Cadence for the attunement nudge emails (page_content key
// `config_attunement_nudge_days`): days between nudges per member; 0 = off.
// Set in the Attunement Tasks manager; consumed by /api/cron/attunement-nudges.
export const DEFAULT_ATTUNEMENT_NUDGE_DAYS = 2
export const ATTUNEMENT_NUDGE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Daily' },
  { value: 2, label: 'Every 2 days' },
  { value: 3, label: 'Every 3 days' },
  { value: 7, label: 'Weekly' },
]

export function parseAttunementNudgeDays(raw?: string | null): number {
  const n = parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n >= 0 && n <= 30 ? n : DEFAULT_ATTUNEMENT_NUDGE_DAYS
}

export function parseAttunementTasks(raw?: string | null): AttunementTask[] {
  if (!raw) return DEFAULT_ATTUNEMENT_TASKS
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return DEFAULT_ATTUNEMENT_TASKS
    return arr
      .filter((t: unknown): t is Record<string, unknown> =>
        !!t && typeof (t as { label?: unknown }).label === 'string' &&
        VALID_ATTUNEMENT_REQUIREMENTS.has((t as { requirement?: unknown }).requirement as string)
      )
      .map((t, i) => {
        const base = {
          id: typeof t.id === 'string' && t.id ? t.id : `task-${i}`,
          label: t.label as string,
          enabled: t.enabled !== false,
        }
        const rawReq = t.requirement as string
        // Legacy 'contribution' → any-collection membership (count 1).
        if (rawReq === 'collection' || rawReq === 'contribution') {
          const collectionId = rawReq === 'contribution'
            ? undefined
            : (typeof t.collectionId === 'string' && t.collectionId ? t.collectionId : undefined)
          const rc = typeof t.requiredCount === 'number' && t.requiredCount >= 1
            ? Math.floor(t.requiredCount)
            : 1
          return { ...base, requirement: 'collection' as const, collectionId, requiredCount: rc }
        }
        // 'shift' carries an optional shift type + required hours.
        if (rawReq === 'shift') {
          const shiftTypeId = typeof t.shiftTypeId === 'string' && t.shiftTypeId ? t.shiftTypeId : undefined
          const rh = typeof t.requiredHours === 'number' && t.requiredHours > 0 ? t.requiredHours : 1
          return { ...base, requirement: 'shift' as const, shiftTypeId, requiredHours: rh }
        }
        return { ...base, requirement: rawReq as AttunementRequirement }
      })
  } catch {
    return DEFAULT_ATTUNEMENT_TASKS
  }
}

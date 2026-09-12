import { tenantDb } from './tenant-db'
import { memberDisplayNames, applicationIdsByClerkId } from './member-names'
import { fetchShiftHolds } from './shift-signups'
import type { ScheduleEvent, ShiftTypeOption, RosterEntry } from '@/app/admin/ScheduleManager'
import type { LeadUpEvent } from '@/app/admin/LeadUpGatheringsManager'
import type { AdminRadioEvent } from '@/app/admin/RadioManager'

// Server-side assembly for the Program tab's managers. Each function is the
// single source for one admin GET's response body: /admin/program calls them
// directly (so the tab is populated on first paint, no mount-fetch wave) and
// the /api/admin/* routes keep serving the client's refresh path from the
// same code — the "Server-rendered section data" pattern in
// docs/architecture.md → Auth.

export type { RosterEntry }

export async function getAdminScheduleEvents(communityId: string): Promise<ScheduleEvent[]> {
  const db = tenantDb(communityId)
  const { data, error } = await db
    .from('schedule_events')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as ScheduleEvent[]
}

export type ShiftTypeRow = ShiftTypeOption & { icon: string | null; sort_order: number }

export async function getAdminShiftTypes(communityId: string): Promise<ShiftTypeRow[]> {
  const db = tenantDb(communityId)
  const { data, error } = await db
    .from('shift_types')
    .select('id, name, icon, sort_order')
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as ShiftTypeRow[]
}

// Who holds each shift, for the admin schedule editor's per-event roster.
// Holds come from member_shift_signups — the single source of shift holds
// (the legacy camp_signups.schedule_event_id column was dropped in 065). The
// query is shared with the Overview shift-hours ledger (lib/shift-signups.ts
// fetchShiftHolds), so the admin count always agrees with the member-facing
// "N signed up".
export async function getAdminRosters(communityId: string): Promise<Record<string, RosterEntry[]>> {
  const many = await fetchShiftHolds(communityId)

  // Each night of a recurring shift is its own roster: hold identity is
  // (event, occurrence, member). Rosters stay keyed by event; the entry carries
  // occurrence_date so the schedule editor can group holders by night.
  type Hold = { clerk_user_id: string; role: 'member' | 'lead'; occurrence_date: string | null }
  const byEvent = new Map<string, Map<string, Hold>>()
  const holdersFor = (eventId: string) => {
    const holders = byEvent.get(eventId) ?? new Map<string, Hold>()
    byEvent.set(eventId, holders)
    return holders
  }
  const holdKey = (userId: string, occ: string | null) => `${userId}|${occ ?? ''}`
  for (const r of many ?? []) {
    if (!r.schedule_event_id) continue
    const occ = (r.occurrence_date as string | null) ?? null
    holdersFor(r.schedule_event_id).set(holdKey(r.clerk_user_id, occ), { clerk_user_id: r.clerk_user_id, role: r.role === 'lead' ? 'lead' : 'member', occurrence_date: occ })
  }

  const allIds = Array.from(byEvent.values()).flatMap(h => Array.from(h.values()).map(v => v.clerk_user_id))
  const [names, applicationIds] = await Promise.all([
    memberDisplayNames(communityId, allIds),
    applicationIdsByClerkId(communityId, allIds),
  ])

  const rosters: Record<string, RosterEntry[]> = {}
  byEvent.forEach((holders, eventId) => {
    rosters[eventId] = Array.from(holders.values())
      .map(h => ({
        clerk_user_id: h.clerk_user_id,
        application_id: applicationIds[h.clerk_user_id] ?? null,
        name: names[h.clerk_user_id] ?? 'Unknown member',
        role: h.role,
        occurrence_date: h.occurrence_date,
      }))
      // Leads first, then alphabetical — the ✦ reads at a glance.
      .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'lead' ? -1 : 1))
  })
  return rosters
}

// All lead-up gatherings with their RSVP headcounts (admin view).
export async function getAdminLeadUpEvents(communityId: string): Promise<LeadUpEvent[]> {
  const db = tenantDb(communityId)
  const [{ data, error }, { data: rsvps }] = await Promise.all([
    db
      .from('lead_up_events')
      .select('*')
      .order('event_date', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true }),
    db.from('lead_up_event_rsvps').select('lead_up_event_id'),
  ])
  if (error) throw new Error(error.message)

  const counts: Record<string, number> = {}
  for (const r of rsvps ?? []) {
    counts[r.lead_up_event_id] = (counts[r.lead_up_event_id] ?? 0) + 1
  }
  return (data ?? []).map(e => ({ ...e, rsvp_count: counts[e.id] ?? 0 })) as LeadUpEvent[]
}

// The Radio manager's "recently on the air" list (all kinds, for curation).
export async function getAdminRadioEvents(communityId: string): Promise<AdminRadioEvent[]> {
  const db = tenantDb(communityId)
  const { data, error } = await db
    .from('radio_events')
    .select('id, kind, message, icon, actor_name, created_at')
    .eq('visible', true)
    .order('created_at', { ascending: false })
    .limit(40)
  if (error) throw new Error(error.message)
  return (data ?? []) as AdminRadioEvent[]
}

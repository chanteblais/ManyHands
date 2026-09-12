import { tenantDb } from './tenant-db'
import type { LeadUpEvent } from '@/app/schedule/LeadUpGatherings'

// Visible, non-past lead-up gatherings with RSVP headcounts and whether this
// member has RSVP'd — the body of GET /api/lead-up-events, shared with the
// /schedule server render so the section paints populated (the
// "Server-rendered section data" pattern, docs/architecture.md → Auth).
// Past gatherings drop out for members (no RSVPing something that already
// happened); dateless gatherings stay. Matches the home-dashboard teaser.
// Caller is responsible for the approved-member gate.
export async function getMemberLeadUpEvents(communityId: string, userId: string): Promise<LeadUpEvent[]> {
  const db = tenantDb(communityId)
  const { data: events, error } = await db
    .from('lead_up_events')
    .select('*')
    .eq('visible', true)
    .or(`event_date.is.null,event_date.gte.${new Date().toISOString().slice(0, 10)}`)
    .order('event_date', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)

  const ids = (events ?? []).map(e => e.id)
  const counts: Record<string, number> = {}
  const mine = new Set<string>()
  if (ids.length) {
    const { data: rsvps } = await db
      .from('lead_up_event_rsvps')
      .select('lead_up_event_id, clerk_user_id')
      .in('lead_up_event_id', ids)
    for (const r of rsvps ?? []) {
      counts[r.lead_up_event_id] = (counts[r.lead_up_event_id] ?? 0) + 1
      if (r.clerk_user_id === userId) mine.add(r.lead_up_event_id)
    }
  }

  return (events ?? []).map(e => ({
    ...e,
    rsvp_count: counts[e.id] ?? 0,
    rsvped: mine.has(e.id),
  })) as LeadUpEvent[]
}

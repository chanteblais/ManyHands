import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb, type TenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'

// Confirm the signed-in user is an approved member before they may RSVP.
async function requireApprovedMember(db: TenantDb, userId: string): Promise<boolean> {
  const { data } = await db
    .from('members')
    .select('status')
    .eq('clerk_user_id', userId)
    .eq('status', 'approved')
    .maybeSingle()
  return !!data
}

async function rsvpCount(db: TenantDb, eventId: string): Promise<number> {
  const { count } = await db
    .from('event_rsvps')
    .select('id', { count: 'exact', head: true })
    .eq('schedule_event_id', eventId)
  return count ?? 0
}

// GET — return whether the current user has RSVP'd + total count for this event.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  try {
    const [{ data: existing }, count] = await Promise.all([
      db
        .from('event_rsvps')
        .select('id')
        .eq('schedule_event_id', params.id)
        .eq('clerk_user_id', userId)
        .maybeSingle(),
      rsvpCount(db, params.id),
    ])

    return NextResponse.json({ rsvped: !!existing, count })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load RSVP'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST — toggle the current user's RSVP for this event.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  try {
    // Allow the client to specify an explicit desired state; default to toggle.
    let desired: 'on' | 'off' | 'toggle' = 'toggle'
    try {
      const body = await req.json()
      if (body?.rsvp === true) desired = 'on'
      else if (body?.rsvp === false) desired = 'off'
    } catch {
      // No / invalid body — fall back to toggle behaviour.
    }

    // Approval gate, event check, and existing-RSVP lookup are independent —
    // one parallel round trip instead of three serial ones.
    const [approved, { data: event }, { data: existing }] = await Promise.all([
      requireApprovedMember(db, userId),
      db
        .from('schedule_events')
        .select('id')
        .eq('id', params.id)
        .eq('visible', true)
        .maybeSingle(),
      db
        .from('event_rsvps')
        .select('id')
        .eq('schedule_event_id', params.id)
        .eq('clerk_user_id', userId)
        .maybeSingle(),
    ])
    if (!approved) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const shouldRemove = desired === 'off' || (desired === 'toggle' && !!existing)

    if (shouldRemove) {
      const { error } = await db
        .from('event_rsvps')
        .delete()
        .eq('schedule_event_id', params.id)
        .eq('clerk_user_id', userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ rsvped: false, count: await rsvpCount(db, params.id) })
    }

    if (!existing) {
      const { error } = await db
        .from('event_rsvps')
        .insert({ schedule_event_id: params.id, clerk_user_id: userId })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rsvped: true, count: await rsvpCount(db, params.id) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to RSVP'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

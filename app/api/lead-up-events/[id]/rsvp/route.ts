import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCommunity } from '@/lib/community'
import { getNotificationPreferences } from '@/lib/notification-prefs'
import { sendSignupConfirmationEmail } from '@/lib/send-email'
import { whenText } from '@/lib/event-reminders'

// Confirm the signed-in user is an approved member before they may RSVP.
async function requireApprovedMember(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('members')
    .select('status')
    .eq('clerk_user_id', userId)
    .eq('status', 'approved')
    .maybeSingle()
  return !!data
}

async function rsvpCount(eventId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('lead_up_event_rsvps')
    .select('id', { count: 'exact', head: true })
    .eq('lead_up_event_id', eventId)
  return count ?? 0
}

// POST — toggle the current member's RSVP for this lead-up gathering.
// This is a per-session "I'll be there" headcount only — it never touches
// attunement, shifts, or camp signup. (Gathering leads were built then
// scrapped 2026-07-02; leads remain a shifts-only concept.)
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const community = await getCommunity()

  try {
    // Allow an explicit desired state; default to toggle.
    let desired: 'on' | 'off' | 'toggle' = 'toggle'
    try {
      const body = await req.json()
      if (body?.rsvp === true) desired = 'on'
      else if (body?.rsvp === false) desired = 'off'
    } catch {
      // No / invalid body — fall back to toggle.
    }

    // Approval gate, gathering check, and existing-RSVP lookup are
    // independent — one parallel round trip instead of three serial ones.
    const [approved, { data: event }, { data: existing }] = await Promise.all([
      requireApprovedMember(userId),
      supabaseAdmin
        .from('lead_up_events')
        .select('id, title, event_date, start_time, location')
        .eq('id', params.id)
        .eq('visible', true)
        .maybeSingle(),
      supabaseAdmin
        .from('lead_up_event_rsvps')
        .select('id')
        .eq('lead_up_event_id', params.id)
        .eq('clerk_user_id', userId)
        .maybeSingle(),
    ])
    if (!approved) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!event) return NextResponse.json({ error: 'Gathering not found' }, { status: 404 })
    if (event.event_date && event.event_date < new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ error: 'This gathering has already happened' }, { status: 400 })
    }

    const shouldRemove = desired === 'off' || (desired === 'toggle' && !!existing)

    if (shouldRemove) {
      const { error } = await supabaseAdmin
        .from('lead_up_event_rsvps')
        .delete()
        .eq('lead_up_event_id', params.id)
        .eq('clerk_user_id', userId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ rsvped: false, count: await rsvpCount(params.id) })
    }

    if (!existing) {
      const { error } = await supabaseAdmin
        .from('lead_up_event_rsvps')
        .insert({ lead_up_event_id: params.id, clerk_user_id: userId })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // Confirmation email (best-effort — never block or fail the RSVP on it),
      // only on a fresh RSVP and only if the member hasn't opted out of
      // gathering/shift email.
      try {
        const prefs = await getNotificationPreferences(userId)
        if (prefs.email_event_reminders) {
          const { data: m } = await supabaseAdmin
            .from('members').select('email, first_name, preferred_name')
            .eq('clerk_user_id', userId).maybeSingle()
          if (m?.email) {
            await sendSignupConfirmationEmail({
              community,
              to: m.email,
              recipientName: m.preferred_name || m.first_name || 'there',
              kind: 'gathering',
              title: event.title,
              whenText: event.event_date ? whenText(event.event_date, event.start_time) : 'Date to be confirmed',
              location: event.location,
              href: '/schedule',
            })
          }
        }
      } catch (e) {
        console.error('[rsvp] confirmation email failed:', e)
      }
    }

    return NextResponse.json({ rsvped: true, count: await rsvpCount(params.id) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to RSVP'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getPageContent, getPageContentValue } from '@/lib/page-content'
import { getShiftParticipant, participantDisplayName } from '@/lib/members'
import { getShiftSignupData } from '@/lib/participate-data'
import { eventRangeDays, isValidOccurrence } from '@/lib/shift-occurrences'
import { getNotificationPreferences } from '@/lib/notification-prefs'
import { sendSignupConfirmationEmail } from '@/lib/send-email'
import { whenText } from '@/lib/event-reminders'

// Member-facing multi-shift signup (shifts redesign). A member holds any number
// of shift occurrences via member_shift_signups — the single source of shift
// holds (the legacy camp_signups.schedule_event_id column was dropped in 065).
//
// Each night of a recurring shift is a regular shift in its own right: a signup
// names its night via occurrence_date (NULL = a non-recurring shift's single
// occurrence). Capacity, holds and leads are all per (event, occurrence_date).

// The guarded configured event range (for validating an "every day" recurring
// shift's occurrence dates), fetched once per request.
async function getRangeDays(communityId: string): Promise<string[]> {
  const c = await getPageContent(communityId, ['config_event_start_date', 'config_event_end_date'])
  return eventRangeDays(c['config_event_start_date'], c['config_event_end_date'])
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()

  // The approval gate runs alongside the data batch — it only gates the
  // response, not what we fetch, so there's no need to serialize on it.
  // Data assembly lives in lib/participate-data.ts, shared with the
  // server-rendered /participate page (this route is the client's refresh path).
  const [participant, data] = await Promise.all([
    getShiftParticipant(community.id, userId),
    getShiftSignupData(community.id, userId),
  ])

  if (!participant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Hour requirements are a member concept (attunement/groups/roles) — a
  // volunteer owes nothing, so their picker never shows requirement chips.
  return NextResponse.json(participant.kind === 'volunteer' ? { ...data, owed: [] } : data)
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { schedule_event_id, occurrence_date: rawDate, role: rawRole } = await req.json()
  if (!schedule_event_id) return NextResponse.json({ error: 'schedule_event_id required' }, { status: 400 })
  // Optional participation role (migration 048); omitting it keeps an existing
  // signup's role, so a plain re-sign never demotes a lead.
  if (rawRole !== undefined && rawRole !== 'member' && rawRole !== 'lead') {
    return NextResponse.json({ error: 'role must be "member" or "lead"' }, { status: 400 })
  }
  const role = rawRole as 'member' | 'lead' | undefined
  const occurrenceDate: string | null = rawDate ?? null

  // Participant gate, signup-open flag, event row, and configured range are
  // all independent — one parallel round trip instead of four serial ones.
  const [participant, flagValue, { data: event }, rangeDays] = await Promise.all([
    getShiftParticipant(community.id, userId),
    getPageContentValue(community.id, 'config_shift_signup_open'),
    db
      .from('schedule_events')
      .select('id, title, capacity, participation_type, visible, needs_lead, is_recurring, recurrence_days, event_date, time, start_time')
      .eq('id', schedule_event_id)
      .single(),
    getRangeDays(community.id),
  ])
  if (!participant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // Suspension is a member state (volunteers are gated by their status instead).
  if (participant.kind === 'member' && participant.member.suspended_at) {
    return NextResponse.json({ error: 'Your attendance is suspended — resume it on your profile to sign up for shifts.' }, { status: 403 })
  }
  if (flagValue === 'false') {
    return NextResponse.json({ error: 'Shift signup is currently closed.' }, { status: 403 })
  }
  if (!event || event.participation_type !== 'shift' || !event.visible) {
    return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
  }
  // The night must be a real occurrence: a date on a recurring shift (one of its
  // nights), or NULL on a non-recurring shift.
  if (!isValidOccurrence(event, occurrenceDate, rangeDays)) {
    return NextResponse.json({
      error: event.is_recurring ? 'occurrence_date must be one of this shift’s nights' : 'This shift is not recurring',
    }, { status: 400 })
  }
  // Lead role exists only on events the organizer opted in (049).
  if (role === 'lead' && !event.needs_lead) {
    return NextResponse.json({ error: 'This shift does not have a lead role' }, { status: 400 })
  }

  let existingQuery = db
    .from('member_shift_signups')
    .select('id, role')
    .eq('clerk_user_id', userId)
    .eq('schedule_event_id', schedule_event_id)
  existingQuery = occurrenceDate == null
    ? existingQuery.is('occurrence_date', null)
    : existingQuery.eq('occurrence_date', occurrenceDate)
  const { data: existing } = await existingQuery.maybeSingle()

  // Re-signing the same night is a no-op bar a role change; a fresh hold goes
  // through claim_shift_signup (073), which re-checks capacity and inserts in
  // one advisory-locked transaction — two concurrent signups can't both take
  // the last slot the way a separate read-then-insert allowed.
  let created = false
  if (existing) {
    if (role && role !== existing.role) {
      const { error } = await db
        .from('member_shift_signups').update({ role }).eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const { data: claim, error } = await db.rpc('claim_shift_signup', {
      p_clerk_user_id: userId,
      p_schedule_event_id: schedule_event_id,
      p_occurrence_date: occurrenceDate,
      p_role: role ?? 'member',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (claim === 'full') return NextResponse.json({ error: `"${event.title}" is full` }, { status: 409 })
    if (claim === 'not_found') return NextResponse.json({ error: 'Shift not found' }, { status: 404 })
    // 'exists' = a concurrent duplicate of this same signup already landed —
    // treat as the no-op re-sign it is (no second email/notification).
    created = claim === 'ok'
  }

  if (created) {
    // Confirmation email on a fresh hold (best-effort — never block the signup),
    // gated by the signer's gathering/shift email preference.
    try {
      const prefs = await getNotificationPreferences(userId)
      const nightDate = occurrenceDate ?? (event as { event_date?: string | null }).event_date ?? null
      const email = participant.kind === 'member' ? participant.member.email : participant.volunteer.email
      if (prefs.email_event_reminders && email) {
        await sendSignupConfirmationEmail({
          community,
          to: email,
          recipientName: participantDisplayName(participant, userId),
          kind: 'shift',
          title: event.title,
          whenText: nightDate
            ? whenText(nightDate, (event as { time?: string | null; start_time?: string | null }).time ?? (event as { start_time?: string | null }).start_time)
            : 'Time to be confirmed',
          // /schedule is member-gated; a volunteer's shifts live on /participate.
          href: participant.kind === 'volunteer' ? '/participate' : '/schedule',
        })
      }
    } catch (e) {
      console.error('[shift-signups] confirmation email failed:', e)
    }
  }

  // Admin notification (same shape as the legacy shift_change event). A role
  // change on an existing signup reads as such, not as a fresh signup. A
  // volunteer's note names them as one and carries no application link.
  const name = participant.kind === 'volunteer'
    ? `${participantDisplayName(participant, userId)} (volunteer)`
    : participantDisplayName(participant, userId)
  const message = existing && role && role !== existing.role
    ? role === 'lead'
      ? `${name} offered to lead "${event.title}"`
      : `${name} stepped back from leading "${event.title}"`
    : `${name} signed up ${role === 'lead' ? 'to lead' : 'for'} "${event.title}"`
  if (created || (existing && role && role !== existing.role)) {
    await db.from('admin_notifications').insert({
      application_id: participant.kind === 'member' ? participant.member.id : null,
      event_type: 'shift_change',
      message,
      details: { schedule_event_id, occurrence_date: occurrenceDate, shift_title: event.title },
    })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const participant = await getShiftParticipant(community.id, userId)
  if (!participant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const schedule_event_id = req.nextUrl.searchParams.get('schedule_event_id')
  if (!schedule_event_id) return NextResponse.json({ error: 'schedule_event_id required' }, { status: 400 })
  const occurrenceDate = req.nextUrl.searchParams.get('occurrence_date') // null = non-recurring hold

  // Cancelling stays allowed while signup is closed (matches legacy behaviour).
  let del = db
    .from('member_shift_signups')
    .delete()
    .eq('clerk_user_id', userId)
    .eq('schedule_event_id', schedule_event_id)
  del = occurrenceDate == null ? del.is('occurrence_date', null) : del.eq('occurrence_date', occurrenceDate)
  const { error } = await del
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

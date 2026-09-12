import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'

// PATCH: clear the member's role, remove one shift (remove_shift: <event_id>),
// clear all their shifts (clear_shift), or set their lead status on one shift
// (set_shift_role: { schedule_event_id, role }). Shifts live in
// member_shift_signups (many-to-many); roles on camp_signups.
export async function PATCH(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json()

  if (!body.clear_role && !body.clear_shift && !body.remove_shift && !body.set_shift_role) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }

  // Admin promote/demote a lead on a shift the member already holds.
  // occurrence_date targets one night of a recurring shift (omit it to affect
  // every held night — back-compatible with callers that don't send it).
  if (body.set_shift_role) {
    const { schedule_event_id, role, occurrence_date } = body.set_shift_role
    if (!schedule_event_id || (role !== 'member' && role !== 'lead')) {
      return NextResponse.json({ error: 'set_shift_role needs schedule_event_id and role "member"|"lead"' }, { status: 400 })
    }
    let q = db
      .from('member_shift_signups')
      .update({ role }, { count: 'exact' })
      .eq('clerk_user_id', params.userId)
      .eq('schedule_event_id', schedule_event_id)
    if ('occurrence_date' in body.set_shift_role) {
      q = occurrence_date == null ? q.is('occurrence_date', null) : q.eq('occurrence_date', occurrence_date)
    }
    const { error, count } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if ((count ?? 0) === 0) {
      return NextResponse.json({ error: 'Member does not hold that shift' }, { status: 404 })
    }
  }

  if (body.clear_role) {
    const { error } = await db
      .from('camp_signups')
      .update({ role_id: null, role_approval_status: null })
      .eq('clerk_user_id', params.userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (body.remove_shift) {
    const { error } = await db
      .from('member_shift_signups')
      .delete()
      .eq('clerk_user_id', params.userId)
      .eq('schedule_event_id', body.remove_shift)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (body.clear_shift) {
    const { error } = await db
      .from('member_shift_signups')
      .delete()
      .eq('clerk_user_id', params.userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

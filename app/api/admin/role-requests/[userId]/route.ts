import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'

export async function PATCH(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { decision } = await req.json() // 'approved' | 'rejected'
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json({ error: 'decision must be approved or rejected' }, { status: 400 })
  }

  const { userId } = params

  // Fetch the signup to get role info
  const { data: signup } = await db
    .from('camp_signups')
    .select('role_id')
    .eq('clerk_user_id', userId)
    .maybeSingle()

  if (!signup) return NextResponse.json({ error: 'Signup not found' }, { status: 404 })

  // Fetch role name for notification
  const { data: role } = await db
    .from('roles')
    .select('name')
    .eq('id', signup.role_id)
    .single()

  // Update approval status (if rejected, also clear the role)
  const update: Record<string, unknown> = { role_approval_status: decision }
  if (decision === 'rejected') update.role_id = null

  const { error } = await db
    .from('camp_signups')
    .update(update)
    .eq('clerk_user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify the camper
  const roleName = role?.name ?? 'your requested role'
  const message = decision === 'approved'
    ? `Your request for the "${roleName}" role has been approved.`
    : `Your request for the "${roleName}" role was not approved. Please choose a different role.`

  await db.from('user_notifications').insert({
    clerk_user_id: userId,
    event_type: decision === 'approved' ? 'role_approved' : 'role_rejected',
    message,
  })

  return NextResponse.json({ success: true })
}

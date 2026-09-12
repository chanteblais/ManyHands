import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'
import { getApprovedMember, memberDisplayName } from '@/lib/members'
import { getRoleSignupData } from '@/lib/participate-data'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The approval gate runs alongside the data batch — it only gates the
  // response, not what we fetch, so there's no need to serialize on it.
  // Data assembly lives in lib/participate-data.ts, shared with the
  // server-rendered /participate page (this route is the client's refresh path).
  const community = await getCommunity()

  const [application, data] = await Promise.all([
    getApprovedMember(community.id, userId),
    getRoleSignupData(community.id, userId),
  ])

  if (!application) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(data)
}

// Role selection only — shifts live entirely in member_shift_signups via
// /api/shift-signups (the legacy single camp_signups.schedule_event_id column
// was dropped in migration 065).
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const application = await getApprovedMember(community.id, userId)
  if (!application) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { role_id } = body

  // role_id can be explicitly null to clear the role
  if (role_id === undefined) {
    return NextResponse.json({ error: 'role_id required' }, { status: 400 })
  }

  const { data: existing } = await db
    .from('camp_signups')
    .select('role_id, role_approval_status')
    .eq('clerk_user_id', userId)
    .maybeSingle()

  const next_role_id = role_id ?? null
  const isRoleChange = existing?.role_id !== next_role_id

  // A suspended member can clear a role but can't take on a new one.
  if (application.suspended_at && isRoleChange && next_role_id) {
    return NextResponse.json({ error: 'Your attendance is suspended — resume it on your profile to sign up.' }, { status: 403 })
  }

  // Check if the new role requires approval
  let requiresApproval = false
  let roleData: { requires_approval: boolean; name: string } | null = null
  if (next_role_id && isRoleChange) {
    const { data, error: roleError } = await db.from('roles').select('requires_approval, name').eq('id', next_role_id).single()
    if (roleError) console.error('[Signup] Role fetch error:', roleError)
    roleData = data
    requiresApproval = roleData?.requires_approval ?? false
  }

  // When the role hasn't changed, preserve the existing approval status.
  const role_approval_status = isRoleChange
    ? (next_role_id ? (requiresApproval ? 'pending' : null) : null)
    : (existing?.role_approval_status ?? null)

  const now = new Date().toISOString()
  const { data, error } = await db
    .from('camp_signups')
    .upsert(
      { clerk_user_id: userId, role_id: next_role_id, role_approval_status, updated_at: now },
      { onConflict: 'community_id,clerk_user_id' } // composite unique since migration 075; community_id stamped by tenantDb // still the unique constraint until migration 075 (community_id, clerk_user_id)
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify admin if role requires approval
  if (requiresApproval && isRoleChange && next_role_id) {
    const name = memberDisplayName(application, userId)

    const { error: notifError } = await db.from('admin_notifications').insert({
      application_id: application.id,
      event_type: 'role_approval_request',
      message: `${name} requested the "${roleData?.name}" role (requires approval)`,
      details: { role_id: next_role_id, role_name: roleData?.name },
    })
    if (notifError) console.error('[Signup] Approval notification error:', notifError)
  }

  // Notify admin on role change (non-approval roles)
  if (!requiresApproval && next_role_id && isRoleChange) {
    const name = memberDisplayName(application, userId)

    const [oldRole, newRole] = await Promise.all([
      db.from('roles').select('name').eq('id', existing?.role_id ?? '').single(),
      db.from('roles').select('name').eq('id', role_id).single(),
    ])
    await db.from('admin_notifications').insert({
      application_id: application.id,
      event_type: 'role_change',
      message: `${name} changed their role`,
      details: {
        from_role: oldRole.data?.name ?? existing?.role_id,
        to_role: newRole.data?.name ?? role_id,
      },
    })
  }

  return NextResponse.json({ signup: data })
}

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getCommunity } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'

// POST { targetUserId, grant: boolean } — admins grant/revoke poll management
// in THIS community (members.can_manage_polls; branch 1d — was Clerk
// publicMetadata.canManagePolls before).
export async function POST(req: Request) {
  const callerId = await requireAdmin()
  if (!callerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { targetUserId, grant } = await req.json()
  if (!targetUserId || typeof grant !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const community = await getCommunity()
  const { error, count } = await tenantDb(community.id)
    .from('members')
    .update({ can_manage_polls: grant, updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('clerk_user_id', targetUserId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'No member record for that user in this community' }, { status: 404 })

  return NextResponse.json({ success: true })
}

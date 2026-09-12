import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getCommunity } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'

// POST { targetUserId, grant: boolean } — grant/revoke admin of THIS community
// (members.role; branch 1d — was Clerk publicMetadata.role before).
export async function POST(req: Request) {
  const callerId = await requireAdmin()
  if (!callerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { targetUserId, grant } = await req.json()
  if (!targetUserId || typeof grant !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Prevent removing your own admin role
  if (!grant && targetUserId === callerId) {
    return NextResponse.json({ error: 'Cannot remove your own admin role' }, { status: 400 })
  }

  const community = await getCommunity()
  const { error, count } = await tenantDb(community.id)
    .from('members')
    .update({ role: grant ? 'admin' : 'member', updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('clerk_user_id', targetUserId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!count) return NextResponse.json({ error: 'No member record for that user in this community' }, { status: 404 })

  return NextResponse.json({ success: true })
}

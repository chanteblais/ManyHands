import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { hasCommunityAdminRole } from '@/lib/admin-auth'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data: shoutout } = await db
    .from('shoutouts')
    .select('id, clerk_user_id')
    .eq('id', params.id)
    .maybeSingle()

  if (!shoutout) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Allowed if author, or admin.
  const isOwner = shoutout.clerk_user_id === userId
  let isAdmin = false
  if (!isOwner) {
    isAdmin = await hasCommunityAdminRole(community.id, userId)
  }
  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db.from('shoutouts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

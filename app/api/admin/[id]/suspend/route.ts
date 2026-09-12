import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'
import { resolveMember } from '@/lib/members'
import { suspendMember, liftSuspension } from '@/lib/suspension'

// Admin suspension toggle for a member, keyed by application id like the
// sibling approve/reject/remove routes. POST { suspended: boolean, note?: string }.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await requireAdmin()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json().catch(() => ({}))
  const suspended = body?.suspended
  if (typeof suspended !== 'boolean') {
    return NextResponse.json({ error: 'suspended (boolean) is required' }, { status: 400 })
  }
  const note = typeof body?.note === 'string' ? body.note.trim() : ''

  const { data: application } = await db
    .from('applications')
    .select('id, clerk_user_id, email, status')
    .eq('id', params.id)
    .single()
  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const member = await resolveMember(community.id, application.clerk_user_id, application.email)
  if (!member) return NextResponse.json({ error: 'No member record found for this application' }, { status: 404 })
  if (member.status !== 'approved') {
    return NextResponse.json({ error: 'Only approved members can be suspended' }, { status: 400 })
  }

  if (suspended) {
    if (member.suspended_at) return NextResponse.json({ success: true })
    const result = await suspendMember(community.id, member, userId, note)
    return NextResponse.json({ success: true, ...result })
  }

  if (!member.suspended_at) return NextResponse.json({ success: true })
  await liftSuspension(community.id, member)
  return NextResponse.json({ success: true })
}

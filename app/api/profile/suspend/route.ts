import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { resolveMemberForUser, memberDisplayName } from '@/lib/members'
import { suspendMember, liftSuspension } from '@/lib/suspension'
import { notifyAdmin } from '@/lib/notify-admin'
import { getCommunity } from '@/lib/community'

// Self-serve suspension: POST { suspended: boolean, note?: string }.
// Suspending releases the member's groups + shifts (see lib/suspension.ts);
// resuming just lifts the flag — nothing is restored automatically.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()

  const member = await resolveMemberForUser(community.id, userId)
  if (!member || member.status !== 'approved') {
    return NextResponse.json({ error: 'Only approved members can suspend their attendance' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const suspended = body?.suspended
  if (typeof suspended !== 'boolean') {
    return NextResponse.json({ error: 'suspended (boolean) is required' }, { status: 400 })
  }
  const note = typeof body?.note === 'string' ? body.note.trim() : ''

  const displayName = memberDisplayName(member, 'A member')

  if (suspended) {
    // Already suspended → idempotent success (double-click, stale tab).
    if (member.suspended_at) return NextResponse.json({ success: true })

    const { roleRemoved, groupsRemoved, shiftsRemoved, resourceClaimsRemoved } = await suspendMember(community.id, member, userId, note)

    await notifyAdmin(community, {
      applicationId: member.application_id,
      eventType: 'attendance_suspended',
      message: `${displayName} suspended their attendance`,
      details: {
        email: member.email,
        ...(note ? { note } : {}),
        role_released: roleRemoved,
        groups_released: groupsRemoved,
        shifts_released: shiftsRemoved,
        resource_claims_released: resourceClaimsRemoved,
      },
    })
  } else {
    if (!member.suspended_at) return NextResponse.json({ success: true })

    await liftSuspension(community.id, member)

    await notifyAdmin(community, {
      applicationId: member.application_id,
      eventType: 'suspension_lifted',
      message: `${displayName} resumed their attendance`,
      details: { email: member.email },
    })
  }

  return NextResponse.json({ success: true })
}

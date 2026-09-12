import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'
import {
  canCancelApplication,
  getOwnedApplication,
} from '@/lib/profile-auth'
import { notifyAdmin } from '@/lib/notify-admin'
import { setMemberStatus } from '@/lib/members'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const user = await currentUser()
  const email = user?.emailAddresses[0]?.emailAddress
  const application = await getOwnedApplication(community.id, userId, email)

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  if (!canCancelApplication(application)) {
    return NextResponse.json({ error: 'This application cannot be cancelled' }, { status: 403 })
  }

  const { reason } = await req.json()
  const cancelReason = typeof reason === 'string' ? reason.trim() : ''

  if (!cancelReason) {
    return NextResponse.json({ error: 'A reason is required to cancel attendance' }, { status: 400 })
  }

  if (cancelReason.length < 10) {
    return NextResponse.json(
      { error: 'Please provide a bit more detail about why you are cancelling' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const { data, error } = await db
    .from('applications')
    .update({
      status: 'cancelled',
      cancel_reason: cancelReason,
      cancelled_at: now,
      profile_updated_at: now,
    })
    .eq('id', application.id)
    .select('*')
    .single()

  if (error) {
    console.error('[profile/cancel POST]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Dual-write: mirror the cancellation onto the canonical member record.
  await setMemberStatus(community.id, userId, application.id as string, 'cancelled')

  // Release their role + shift slots (same cleanup as the admin remove flow) —
  // a cancelled member must not keep occupying shift capacity or rosters.
  const memberClerkId = (application.clerk_user_id as string | null) ?? userId
  await Promise.all([
    db.from('camp_signups').delete().eq('clerk_user_id', memberClerkId),
    db.from('member_shift_signups').delete().eq('clerk_user_id', memberClerkId),
  ])

  const displayName =
    (application.preferred_name as string) ||
    (application.first_name as string) ||
    'Camper'

  await notifyAdmin(community, {
    applicationId: application.id,
    eventType: 'attendance_cancelled',
    message: `${displayName} cancelled their attendance`,
    details: {
      email: application.email,
      reason: cancelReason,
      previous_status: application.status,
    },
  })

  return NextResponse.json({ success: true, application: data })
}

import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { sendUserEmail } from '@/lib/send-email'
import { requireAdmin } from '@/lib/admin-auth'
import { setMemberStatus } from '@/lib/members'
import { deleteGroupWelcome } from '@/lib/conversations'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await requireAdmin()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)
  const client = await clerkClient()

  const { id } = params

  // Optional admin-supplied reason
  let reason = ''
  try {
    const body = await req.json()
    reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  } catch {
    // no body — fine
  }

  // Fetch application so we can clear their signups and notify them
  const { data: application } = await db
    .from('applications')
    .select('clerk_user_id, first_name, preferred_name')
    .eq('id', id)
    .single()

  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  // Soft-remove: mark cancelled, preserving the row (reversible by re-approving)
  const { error: updateError } = await db
    .from('applications')
    .update({
      status: 'cancelled',
      cancel_reason: reason || 'Removed by a camp organizer.',
      cancelled_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Mirror onto the canonical member record — member-only access checks
  // (getApprovedMember) read members.status, not the application row.
  await setMemberStatus(community.id, application?.clerk_user_id ?? null, id, 'cancelled')

  // Free up their role + shift slots (role lives on camp_signups; shift claims
  // live on member_shift_signups since the shifts redesign) and revoke group
  // memberships — group_members is what grants group-thread access and roster
  // presence, so it must not outlive the membership.
  let emailWarning: string | undefined
  if (application?.clerk_user_id) {
    await Promise.all([
      db
        .from('camp_signups')
        .delete()
        .eq('clerk_user_id', application.clerk_user_id),
      db
        .from('member_shift_signups')
        .delete()
        .eq('clerk_user_id', application.clerk_user_id),
      db
        .from('group_members')
        .delete()
        .eq('clerk_user_id', application.clerk_user_id),
      // All their private group welcome notes go with the memberships.
      deleteGroupWelcome(application.clerk_user_id),
    ])

    // Notify the removed member
    const displayName = application.preferred_name || application.first_name || 'there'
    const message = 'Your membership for this gathering has been removed by the Many Hands.'
    await db.from('user_notifications').insert([{
      clerk_user_id: application.clerk_user_id,
      event_type: 'membership_removed',
      message,
    }])

    // A deleted / unknown Clerk account must not turn the (already committed)
    // removal into a 500 — degrade to the email warning instead.
    let email: string | undefined
    try {
      const clerkUser = await client.users.getUser(application.clerk_user_id)
      email = clerkUser.emailAddresses[0]?.emailAddress
    } catch {
      email = undefined
    }
    if (email) {
      const result = await sendUserEmail(
        community,
        email,
        `An update on your ${community.name} membership`,
        `<p>Hi ${displayName},</p><p>${message}</p>${reason ? `<p>${reason}</p>` : ''}<p>If you believe this was a mistake, please reach out to the camp organizers.</p>`,
      )
      // Removal itself succeeded (status + slot release + in-app notification);
      // only the email failed. Surface it so the admin knows to follow up
      // manually instead of assuming the member was emailed.
      if (!result.ok) emailWarning = `Membership removed, but the email to ${email} failed to send: ${result.error}`
    } else {
      emailWarning = 'Membership removed, but no email address was found for this member.'
    }
  }

  return NextResponse.json({ success: true, emailWarning })
}

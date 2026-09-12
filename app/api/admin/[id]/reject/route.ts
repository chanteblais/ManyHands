import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { sendUserEmail } from '@/lib/send-email'
import { setMemberStatus } from '@/lib/members'
import { requireAdmin } from '@/lib/admin-auth'
import { deleteGroupWelcome } from '@/lib/conversations'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await requireAdmin()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)
  const client = await clerkClient()

  // Fetch application so we can notify the user
  const { data: application } = await db
    .from('applications')
    .select('clerk_user_id, first_name, preferred_name')
    .eq('id', params.id)
    .single()

  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  const { error } = await db
    .from('applications')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Dual-write: mirror the rejection onto the canonical member record.
  await setMemberStatus(community.id, application?.clerk_user_id ?? null, params.id, 'rejected')

  // Revoke apply-time group opt-ins — group_members grants group-thread access
  // and roster presence, which a rejected applicant shouldn't keep. Their
  // private group welcome notes go with the memberships.
  if (application?.clerk_user_id) {
    await db
      .from('group_members')
      .delete()
      .eq('clerk_user_id', application.clerk_user_id)
    await deleteGroupWelcome(community.id, application.clerk_user_id)
  }

  // Notify the applicant
  let emailWarning: string | undefined
  if (application?.clerk_user_id) {
    const message = 'The Many Hands have reviewed your application. Unfortunately it wasn\'t a fit for this gathering.'
    await db.from('user_notifications').insert([{
      clerk_user_id: application.clerk_user_id,
      event_type: 'application_rejected',
      message,
    }])

    // A deleted / unknown Clerk account must not turn the (already committed)
    // rejection into a 500 — degrade to the email warning instead.
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
        `An update on your ${community.name} application`,
        `<p>Hi ${application.preferred_name || application.first_name || 'there'},</p><p>${message}</p><p>Thank you for your interest in ${community.name}.</p>`,
      )
      // Rejection itself succeeded (status + in-app notification); only the
      // email failed. Surface it so the admin knows to follow up manually
      // instead of assuming the applicant was emailed.
      if (!result.ok) emailWarning = `Application rejected, but the email to ${email} failed to send: ${result.error}`
    } else {
      emailWarning = 'Application rejected, but no email address was found for this applicant.'
    }
  }

  return NextResponse.json({ success: true, emailWarning })
}

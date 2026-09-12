import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { sendUserEmail, appOrigin } from '@/lib/send-email'
import { upsertMember } from '@/lib/members'
import { requireAdmin } from '@/lib/admin-auth'
import { postSourcedRadioEvent, welcomeRadioPost } from '@/lib/radio'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await requireAdmin()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)
  const client = await clerkClient()

  const { id } = params

  // Fetch application so we can notify the user (and mirror identity onto the
  // canonical member record below)
  const { data: application } = await db
    .from('applications')
    .select('clerk_user_id, email, first_name, last_name, preferred_name, pronouns, phone, avatar_url')
    .eq('id', id)
    .single()

  if (!application) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

  // Mark application as approved
  const { error: updateError } = await db
    .from('applications')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Mirror the approval onto the canonical member record. upsertMember (not
  // setMemberStatus, which only UPDATEs) so a members row that was never
  // created — e.g. pre-dual-write submissions — is inserted here rather than
  // silently no-opping and locking the approved member out of every
  // member-only surface (getApprovedMember gates on members.status).
  await upsertMember(community.id, application.clerk_user_id ?? null, {
    email: application.email,
    first_name: application.first_name,
    last_name: application.last_name,
    preferred_name: application.preferred_name,
    pronouns: application.pronouns,
    phone: application.phone,
    avatar_url: application.avatar_url,
    status: 'approved',
    application_id: id,
  })

  // Notify the applicant
  let emailWarning: string | undefined
  if (application?.clerk_user_id) {
    const displayName = application.preferred_name || application.first_name || 'Camper'
    const message = `Welcome to ${community.name}, ${displayName}! Your application has been approved. 🎉`
    await db.from('user_notifications').insert([{
      clerk_user_id: application.clerk_user_id,
      event_type: 'application_approved',
      message,
    }])

    // Radio: welcome the new member — once per member (re-approvals and the
    // migration-061 backfill both mean a welcome may already exist).
    const { data: alreadyOnAir } = await db
      .from('radio_events')
      .select('id')
      .eq('kind', 'welcome')
      .eq('actor_clerk_id', application.clerk_user_id)
      .limit(1)
      .maybeSingle()
    if (!alreadyOnAir) {
      await postSourcedRadioEvent(community.id, 'welcome', {
        ...welcomeRadioPost(community.name, displayName),
        actorClerkId: application.clerk_user_id,
        actorName: displayName,
        // /members/[id] resolves clerk ids directly — the gold name links home.
        link: `/members/${application.clerk_user_id}`,
      })
    }

    // A deleted / unknown Clerk account must not turn the (already committed)
    // approval into a 500 — degrade to the email warning instead.
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
        `Your ${community.name} application has been approved!`,
        `<p>Hi ${displayName},</p><p>Great news — your application to ${community.name} has been approved! Head to your <a href="${appOrigin(community)}/profile">profile</a> to choose your role and shift.</p><p>See you at camp ✦</p>`,
      )
      // Approval itself succeeded (status + in-app notification); only the
      // email failed. Surface it so the admin knows to follow up manually
      // instead of assuming the member was emailed.
      if (!result.ok) emailWarning = `Application approved, but the email to ${email} failed to send: ${result.error}`
    } else {
      emailWarning = 'Application approved, but no email address was found for this member.'
    }
  }

  return NextResponse.json({ success: true, emailWarning })
}

import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { sendUserEmail, appOrigin } from '@/lib/send-email'
import { requireAdmin } from '@/lib/admin-auth'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await requireAdmin()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)
  const client = await clerkClient()

  const { data: volunteer, error: fetchError } = await db
    .from('volunteers')
    .select('id, clerk_user_id, first_name, preferred_name')
    .eq('id', params.id)
    .maybeSingle()

  if (fetchError || !volunteer) {
    return NextResponse.json({ error: 'Volunteer not found' }, { status: 404 })
  }

  const { error } = await db
    .from('volunteers')
    .update({ status: 'active' })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify the volunteer if they have a Clerk account linked
  if (volunteer.clerk_user_id) {
    const displayName = volunteer.preferred_name || volunteer.first_name || 'there'
    await db.from('user_notifications').insert([{
      clerk_user_id: volunteer.clerk_user_id,
      message: 'Your volunteer signup has been approved!',
      details: {},
    }])

    // A deleted / unknown Clerk account must not turn the (already committed)
    // approval into a 500 — skip the email instead.
    let email: string | undefined
    try {
      const clerkUser = await client.users.getUser(volunteer.clerk_user_id)
      email = clerkUser.emailAddresses[0]?.emailAddress
    } catch {
      email = undefined
    }
    if (email) {
      await sendUserEmail(
        community,
        email,
        `Your ${community.name} volunteer signup has been approved!`,
        `<p>Hi ${displayName},</p><p>You're in! Your volunteer signup for ${community.name} has been approved. Head to your <a href="${appOrigin(community)}/profile">profile</a> to see next steps.</p><p>See you at camp ✦</p>`,
      )
    }
  }

  return NextResponse.json({ success: true })
}

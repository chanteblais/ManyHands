import { auth, currentUser } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { getCommunity } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'
import { resolveMember } from '@/lib/members'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Only trust Clerk-verified sessions. If auth() hasn't caught up right
  // after sign-in, HeaderClient retries this endpoint — never fall back to
  // reading the session cookie without signature verification.
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json(
      { isSignedIn: false },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  // Fast path: a linked member row answers everything the nav needs (name,
  // email, avatar, approval) from one indexed query — no Clerk Backend-API
  // round-trip, which this route otherwise pays on every page view.
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const memberRow = await resolveMember(community.id, userId)
  if (memberRow) {
    return NextResponse.json(
      {
        isSignedIn: true,
        isApproved: memberRow.status === 'approved',
        firstName: memberRow.preferred_name ?? memberRow.first_name ?? null,
        email: memberRow.email ?? null,
        avatarUrl: memberRow.avatar_url ?? null,
        isAdmin: memberRow.role === 'admin',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  // No member row (signed-in non-member): resolve identity from Clerk.
  const user = await currentUser()

  if (!user) {
    return NextResponse.json(
      { isSignedIn: false },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const email = user.emailAddresses[0]?.emailAddress ?? null

  // Fetch application status + avatar
  let avatarUrl: string | null = null
  let isApproved = false

  const { data: appRow } = await db
    .from('members')
    .select('avatar_url, status')
    .or(`clerk_user_id.eq.${userId}${email ? `,email.eq.${email}` : ''}`)
    .limit(1)
    .maybeSingle()

  if (appRow) {
    avatarUrl = appRow.avatar_url ?? null
    isApproved = appRow.status === 'approved'
  } else {
    const { data: volRow } = await db
      .from('volunteers')
      .select('avatar_url')
      .eq('clerk_user_id', userId)
      .not('avatar_url', 'is', null)
      .limit(1)
      .maybeSingle()
    avatarUrl = volRow?.avatar_url ?? null
  }

  return NextResponse.json(
    {
      isSignedIn: true,
      isApproved,
      firstName: user.firstName ?? null,
      email,
      avatarUrl,
      isAdmin: false,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

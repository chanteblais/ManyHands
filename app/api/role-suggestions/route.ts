import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  // Only approved members can suggest roles
  const user = await currentUser()
  const email = user?.emailAddresses[0]?.emailAddress
  const { data: application } = await db
    .from('members')
    .select('status, preferred_name, first_name')
    .or(`clerk_user_id.eq.${userId},email.eq.${email}`)
    .eq('status', 'approved')
    .maybeSingle()

  if (!application) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { dept_name, dept_description, role_name, role_description, notes } = body

  if (!dept_name?.trim() || !role_name?.trim()) {
    return NextResponse.json({ error: 'Department and role name are required' }, { status: 400 })
  }

  const applicantName = application.preferred_name || application.first_name || 'A member'

  const { data: suggestion, error } = await db
    .from('role_suggestions')
    .insert({
      clerk_user_id: userId,
      applicant_name: applicantName,
      dept_name: dept_name.trim(),
      dept_description: dept_description?.trim() || null,
      role_name: role_name.trim(),
      role_description: role_description?.trim() || null,
      notes: notes?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify admin
  await db.from('admin_notifications').insert({
    event_type: 'role_suggestion',
    message: `${applicantName} suggested a new role`,
    details: `${role_name} (${dept_name})${notes ? ` — "${notes}"` : ''}`,
  })

  return NextResponse.json({ suggestion })
}

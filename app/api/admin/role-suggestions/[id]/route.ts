import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { sendUserEmail, appOrigin } from '@/lib/send-email'
import { requireAdmin } from '@/lib/admin-auth'
import { getCommunity } from '@/lib/community'

async function getUserEmail(clerkUserId: string): Promise<string | null> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(clerkUserId)
    return user.emailAddresses[0]?.emailAddress ?? null
  } catch {
    return null
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const community = await getCommunity()
    const db = tenantDb(community.id)

    const { decision } = await req.json() // 'approved' | 'rejected'

    const { data: suggestion, error: fetchError } = await db
      .from('role_suggestions')
      .select('*')
      .eq('id', params.id)
      .eq('status', 'pending')
      .single()

    if (fetchError || !suggestion) return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })

    if (decision === 'approved') {
      // Find or create the department
      let deptId: string

      const { data: existingDept } = await db
        .from('departments')
        .select('id')
        .ilike('name', suggestion.dept_name)
        .maybeSingle()

      if (existingDept) {
        deptId = existingDept.id
      } else {
        const { data: newDept, error: deptError } = await db
          .from('departments')
          .insert({ name: suggestion.dept_name, description: suggestion.dept_description ?? null })
          .select()
          .single()
        if (deptError) return NextResponse.json({ error: deptError.message }, { status: 500 })
        deptId = newDept.id
      }

      // Get current role count for sort_order
      const { count } = await db
        .from('roles')
        .select('id', { count: 'exact', head: true })
        .eq('department_id', deptId)

      // Create the role
      const { error: roleError } = await db
        .from('roles')
        .insert({
          name: suggestion.role_name,
          description: suggestion.role_description ?? null,
          department_id: deptId,
          sort_order: count ?? 0,
        })

      if (roleError) return NextResponse.json({ error: roleError.message }, { status: 500 })

      // Notify the member
      await db.from('user_notifications').insert({
        clerk_user_id: suggestion.clerk_user_id,
        message: 'Your role suggestion was approved',
        details: `"${suggestion.role_name}" has been added to the ${suggestion.dept_name} department and is now available to select.`,
      })
      const approvedEmail = await getUserEmail(suggestion.clerk_user_id)
      if (approvedEmail) {
        await sendUserEmail(
          community,
          approvedEmail,
          `Your ${community.name} role suggestion was approved!`,
          `<p>Great news! Your suggested role "${suggestion.role_name}" has been added to the ${suggestion.dept_name} department and is now available to select on your <a href="${appOrigin(community)}/profile">profile</a>.</p>`,
        )
      }
    } else {
      // Notify the member of rejection
      await db.from('user_notifications').insert({
        clerk_user_id: suggestion.clerk_user_id,
        message: 'Your role suggestion was reviewed',
        details: `Your suggestion for "${suggestion.role_name}" was not added at this time. Reach out to an organiser if you have questions.`,
      })
      const rejectedEmail = await getUserEmail(suggestion.clerk_user_id)
      if (rejectedEmail) {
        await sendUserEmail(
          community,
          rejectedEmail,
          `An update on your ${community.name} role suggestion`,
          `<p>Thanks for the suggestion! Unfortunately "${suggestion.role_name}" wasn't added at this time. Reach out to an organiser if you have questions.</p>`,
        )
      }
    }

    // Update suggestion status
    await db
      .from('role_suggestions')
      .update({ status: decision })
      .eq('id', params.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PATCH /api/admin/role-suggestions/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

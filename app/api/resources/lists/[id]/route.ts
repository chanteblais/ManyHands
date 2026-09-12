import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCommunity } from '@/lib/community'
import { getApprovedMember } from '@/lib/members'
import { requireAdmin } from '@/lib/admin-auth'

// Edit (PATCH) or delete (DELETE) a resource list. Editing is wiki-open — any
// approved member can rename a list or change its description. Deleting is the
// one destructive guardrail: it cascades away every item and every claim, so
// it's ADMIN-ONLY (2026-07-08). See app/api/resources/lists/route.ts.

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()

  const member = await getApprovedMember(community.id, userId)
  if (!member) {
    return NextResponse.json({ error: 'Only approved members can edit lists' }, { status: 403 })
  }
  if (member.suspended_at) {
    return NextResponse.json({ error: 'Your attendance is suspended — resume it on your profile to manage resources.' }, { status: 403 })
  }

  const { title, description, show_on_dashboard } = await req.json()
  const patch: Record<string, unknown> = {}
  if (title !== undefined) {
    if (!title?.trim()) return NextResponse.json({ error: 'A title is required' }, { status: 400 })
    patch.title = title.trim().slice(0, 80)
  }
  if (description !== undefined) patch.description = description?.trim().slice(0, 300) || null
  if (show_on_dashboard !== undefined) patch.show_on_dashboard = show_on_dashboard === true
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { error } = await supabaseAdmin.from('resource_lists').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Deleting a whole list wipes its items and everyone's claims — admin-only.
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Only admins can delete lists' }, { status: 403 })

  const { error } = await supabaseAdmin.from('resource_lists').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

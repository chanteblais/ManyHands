import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getApprovedMember } from '@/lib/members'

// Create a resource list. Shared Resources is member-owned (2026-07-08): any
// approved member can start a list on /participate → Bring Something. Lists go
// live immediately (`visible` defaults true) — there is no admin authoring
// surface anymore. Editing is wiki-open; only DELETE is admin-gated (see
// lists/[id]/route.ts).
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const member = await getApprovedMember(community.id, userId)
  if (!member) {
    return NextResponse.json({ error: 'Only approved members can create lists' }, { status: 403 })
  }
  if (member.suspended_at) {
    return NextResponse.json({ error: 'Your attendance is suspended — resume it on your profile to manage resources.' }, { status: 403 })
  }

  const { title, description, show_on_dashboard } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'A title is required' }, { status: 400 })

  const { data: list, error } = await db
    .from('resource_lists')
    .insert({
      title: title.trim().slice(0, 80),
      description: description?.trim().slice(0, 300) || null,
      show_on_dashboard: show_on_dashboard === true,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, list })
}

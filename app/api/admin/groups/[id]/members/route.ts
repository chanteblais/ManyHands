import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'
import { sendGroupWelcome, deleteGroupWelcome } from '@/lib/conversations'

// GET — roster for a group, enriched with each member's application info.
// No FK between group_members and applications, so we join in JS by clerk_user_id.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data: rows, error } = await db
    .from('group_members')
    .select('clerk_user_id, source, created_at')
    .eq('group_id', params.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (rows ?? []).map(r => r.clerk_user_id)
  const appsById: Record<string, { id: string; first_name: string; last_name: string; preferred_name: string | null; email: string; status: string }> = {}
  if (ids.length > 0) {
    const { data: apps } = await db
      .from('applications')
      .select('id, clerk_user_id, first_name, last_name, preferred_name, email, status')
      .in('clerk_user_id', ids)
    for (const a of apps ?? []) {
      if (a.clerk_user_id) appsById[a.clerk_user_id] = a
    }
  }

  const members = (rows ?? []).map(r => {
    const app = appsById[r.clerk_user_id]
    return {
      clerk_user_id: r.clerk_user_id,
      application_id: app?.id ?? null,
      source: r.source,
      first_name: app?.first_name ?? null,
      last_name: app?.last_name ?? null,
      preferred_name: app?.preferred_name ?? null,
      email: app?.email ?? null,
      status: app?.status ?? null,
    }
  })

  return NextResponse.json({ members })
}

// POST — add a member to the group by clerk_user_id.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { clerk_user_id } = await req.json()
  if (!clerk_user_id) return NextResponse.json({ error: 'clerk_user_id is required' }, { status: 400 })

  const { data: inserted, error } = await db
    .from('group_members')
    .upsert(
      { group_id: params.id, clerk_user_id, source: 'admin' },
      { onConflict: 'group_id,clerk_user_id', ignoreDuplicates: true },
    )
    .select('clerk_user_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fresh membership (not an idempotent re-add) → private welcome note in the
  // group thread, so the member's unread badge tells them they're in the group.
  if ((inserted ?? []).length > 0) await sendGroupWelcome(community.id, params.id, clerk_user_id)

  return NextResponse.json({ success: true })
}

// DELETE — remove a member from the group (clerk_user_id passed as ?clerk_user_id=).
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const clerkUserId = req.nextUrl.searchParams.get('clerk_user_id')
  if (!clerkUserId) return NextResponse.json({ error: 'clerk_user_id is required' }, { status: 400 })

  const { error } = await db
    .from('group_members')
    .delete()
    .eq('group_id', params.id)
    .eq('clerk_user_id', clerkUserId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Clear the member's private welcome note so a later re-add welcomes freshly.
  await deleteGroupWelcome(community.id, clerkUserId, params.id)

  return NextResponse.json({ success: true })
}

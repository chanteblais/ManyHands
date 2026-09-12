import { NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data, error } = await db
    .from('admin_notifications')
    .select('id, application_id, event_type, message, details, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ notifications: data ?? [] })
}

// Mark all unread as read
export async function PATCH() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const now = new Date().toISOString()
  const { error } = await db
    .from('admin_notifications')
    .update({ read_at: now })
    .is('read_at', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// Clear all notifications
export async function DELETE() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { error } = await db
    .from('admin_notifications')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // delete all rows

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

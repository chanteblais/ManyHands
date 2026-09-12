import { NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { id } = await params
  const { error } = await db
    .from('admin_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

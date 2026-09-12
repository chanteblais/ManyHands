import { NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET() {
  const userId = await requireAdmin()
  if (!userId) return NextResponse.json({ error: 'Not admin' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data, error, count } = await db
    .from('applications')
    .select('id, email, status, submitted_at', { count: 'exact' })
    .order('submitted_at', { ascending: false })

  return NextResponse.json({
    supabaseError: error ?? null,
    count,
    rows: data ?? [],
  })
}

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data, error } = await db
    .from('user_notifications')
    .select('id, event_type, message, details, created_at, read_at')
    .eq('clerk_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    { notifications: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function PATCH() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const now = new Date().toISOString()
  const { error } = await db
    .from('user_notifications')
    .update({ read_at: now })
    .eq('clerk_user_id', userId)
    .is('read_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

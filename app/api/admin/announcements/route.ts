import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const now = new Date().toISOString()
  const { data, error } = await db
    .from('announcements')
    .select('*')
    .eq('visible', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ announcements: data })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json()
  const { data, error } = await db
    .from('announcements')
    .insert([{
      title: body.title,
      body: body.body || null,
      pinned: body.pinned ?? false,
      visible: body.visible ?? true,
      expires_at: body.expires_at || null,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ announcement: data })
}

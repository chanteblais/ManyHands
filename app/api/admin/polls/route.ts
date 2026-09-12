import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requirePollManager } from '@/lib/poll-auth'

export async function GET() {
  if (!(await requirePollManager())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data, error } = await db
    .from('polls')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ polls: data })
}

export async function POST(req: NextRequest) {
  if (!(await requirePollManager())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json()
  const { data, error } = await db
    .from('polls')
    .insert([{
      question: body.question,
      options: body.options,
      visible: body.visible ?? true,
      allow_multiple: body.allow_multiple ?? false,
      expires_at: body.expires_at || null,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ poll: data })
}

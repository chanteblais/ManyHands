import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { tenantDb, type TenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'

const MAX_LEN = 250

type ShoutoutRow = { id: string; clerk_user_id: string; author_name: string; body: string; created_at: string }

// Attach each author's current avatar (joined in JS — no FK to applications).
async function withAvatars(db: TenantDb, rows: ShoutoutRow[]) {
  const ids = Array.from(new Set(rows.map(r => r.clerk_user_id)))
  if (ids.length === 0) return rows.map(r => ({ ...r, avatar_url: null as string | null }))
  const { data: apps } = await db
    // Phase 5: identity resolution reads the canonical `members` table.
    .from('members')
    .select('clerk_user_id, avatar_url')
    .in('clerk_user_id', ids)
  const avatarMap = Object.fromEntries((apps ?? []).map(a => [a.clerk_user_id, a.avatar_url]))
  return rows.map(r => ({ ...r, avatar_url: avatarMap[r.clerk_user_id] ?? null }))
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data, error } = await db
    .from('shoutouts')
    .select('id, clerk_user_id, author_name, body, created_at')
    .eq('visible', true)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shoutouts: await withAvatars(db, (data ?? []) as ShoutoutRow[]) })
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  // Only approved members can post.
  const user = await currentUser()
  const email = user?.emailAddresses[0]?.emailAddress
  const { data: application } = await db
    .from('members')
    .select('status, preferred_name, first_name')
    .or(`clerk_user_id.eq.${userId},email.eq.${email}`)
    .eq('status', 'approved')
    .maybeSingle()

  if (!application) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const text = (body.body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'Say something first.' }, { status: 400 })
  if (text.length > MAX_LEN) return NextResponse.json({ error: `Keep it under ${MAX_LEN} characters.` }, { status: 400 })

  const authorName = application.preferred_name || application.first_name || 'A member'

  const { data: created, error } = await db
    .from('shoutouts')
    .insert({ clerk_user_id: userId, author_name: authorName, body: text })
    .select('id, clerk_user_id, author_name, body, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const [enriched] = await withAvatars(db, [created as ShoutoutRow])
  return NextResponse.json({ shoutout: enriched })
}

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'

export const dynamic = 'force-dynamic'

// POST /api/push/register — the native app calls this after the member grants
// notification permission (and again whenever FCM rotates the token).
// Upserting on the token keeps one row per device: a device that changes hands
// between accounts (sign out / sign in) re-homes to the new member.
export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id) // push_tokens is a global table — db.from passes it through unscoped

  let body: { token?: string; platform?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null
  if (!token || token.length > 4096 || !platform) {
    return NextResponse.json({ error: 'token and platform (ios|android) required' }, { status: 400 })
  }

  const { error } = await db
    .from('push_tokens')
    .upsert(
      { clerk_user_id: userId, token, platform, last_seen_at: new Date().toISOString() },
      { onConflict: 'token' }
    )
  if (error) {
    console.error('[push/register] upsert failed:', error)
    return NextResponse.json({ error: 'Failed to register' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/push/register — the app calls this on sign-out so the device
// stops receiving the signed-out member's notifications.
export async function DELETE(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id) // push_tokens is a global table — db.from passes it through unscoped

  let body: { token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  // Scoped to the caller's own rows — one member can't unregister another's device.
  const { error } = await db
    .from('push_tokens')
    .delete()
    .eq('token', token)
    .eq('clerk_user_id', userId)
  if (error) {
    console.error('[push/register] delete failed:', error)
    return NextResponse.json({ error: 'Failed to unregister' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

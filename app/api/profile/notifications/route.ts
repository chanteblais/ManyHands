import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'
import { getNotificationPreferences } from '@/lib/notification-prefs'

export const dynamic = 'force-dynamic'

const KEYS = ['email_new_message', 'email_announcements', 'email_application', 'email_attunement_nudges', 'email_event_reminders'] as const

// GET /api/profile/notifications — current member's preferences
export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 'defaults' on error: this renders toggles, it doesn't gate a send — showing
  // everything OFF on a transient DB error would invite a wrong re-save.
  const prefs = await getNotificationPreferences(userId, { onError: 'defaults' })
  return NextResponse.json({ preferences: prefs }, { headers: { 'Cache-Control': 'no-store' } })
}

// PATCH /api/profile/notifications — upsert preferences
export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json().catch(() => ({}))
  const updates: Record<string, boolean> = {}
  for (const key of KEYS) {
    if (key in body) updates[key] = Boolean(body[key])
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid preferences provided' }, { status: 400 })
  }

  const { error } = await db
    .from('notification_preferences')
    .upsert(
      { clerk_user_id: userId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: 'clerk_user_id' }
    )

  if (error) {
    console.error('[profile/notifications PATCH]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const prefs = await getNotificationPreferences(userId, { onError: 'defaults' })
  return NextResponse.json({ success: true, preferences: prefs })
}

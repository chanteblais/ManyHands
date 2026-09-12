import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { requireAdmin } from '@/lib/admin-auth'
import { postRadioEvent } from '@/lib/radio'
import { sendUserEmail, appOrigin } from '@/lib/send-email'
import { getCommunity } from '@/lib/community'
import { getAdminRadioEvents } from '@/lib/admin-program-data'

// GET — recent radio events for the manager (all kinds, so admins can curate
// the automatic ones too). Same assembly the Program page server-renders.
export async function GET() {
  const userId = await requireAdmin()
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()

  try {
    return NextResponse.json({ events: await getAdminRadioEvents(community.id) })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load' }, { status: 500 })
  }
}

// POST — organizer broadcast { message, icon?, notify? }. Radio itself never
// notifies; `notify` is the deliberate exception (bell + announcement email,
// honouring the member's email_announcements preference — the lead-up pattern).
export async function POST(req: NextRequest) {
  const userId = await requireAdmin()
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { message, detail, icon, notify } = await req.json().catch(() => ({}))
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }
  const body = message.trim().slice(0, 280)
  const detailValue = typeof detail === 'string' && detail.trim() ? detail.trim().slice(0, 280) : null
  const iconValue = typeof icon === 'string' && icon.trim() ? icon.trim().slice(0, 200) : '📢'

  // Sign the broadcast with the organizer's name — Radio speech reads the same
  // whoever holds the mic (the feed renders "— Name" on every spoken row).
  const { data: me } = await db
    .from('members')
    .select('preferred_name, first_name')
    .eq('clerk_user_id', userId)
    .maybeSingle()
  const actorName = me?.preferred_name || me?.first_name || null

  const id = await postRadioEvent(community.id, {
    kind: 'broadcast',
    message: body,
    detail: detailValue,
    icon: iconValue,
    actorClerkId: userId,
    actorName,
    createdBy: userId,
  })
  if (!id) return NextResponse.json({ error: 'Failed to post' }, { status: 500 })

  let notified = 0
  let emailed = 0
  if (notify === true) {
    const { data: membersRaw } = await db
      .from('members')
      .select('clerk_user_id, email, first_name, preferred_name')
      .eq('status', 'approved')
    const recipients = (membersRaw ?? []).filter(m => m.clerk_user_id !== userId)

    const bellRows = recipients
      .filter(m => m.clerk_user_id)
      .map(m => ({
        clerk_user_id: m.clerk_user_id as string,
        event_type: 'radio_broadcast',
        message: body,
        details: { radioEventId: id },
      }))
    if (bellRows.length) {
      await db.from('user_notifications').insert(bellRows)
      notified = bellRows.length
    }

    // Announcement-email preference in one query (default ON when no row).
    const clerkIds = recipients.map(m => m.clerk_user_id).filter(Boolean) as string[]
    const optedOut = new Set<string>()
    if (clerkIds.length) {
      const { data: prefRows } = await db
        .from('notification_preferences')
        .select('clerk_user_id, email_announcements')
        .in('clerk_user_id', clerkIds)
      for (const p of prefRows ?? []) {
        if (p.email_announcements === false) optedOut.add(p.clerk_user_id)
      }
    }

    for (const m of recipients) {
      if (!m.email) continue
      if (m.clerk_user_id && optedOut.has(m.clerk_user_id)) continue
      try {
        const result = await sendUserEmail(
          community,
          m.email,
          `${community.name} Radio: ${body.slice(0, 60)}${body.length > 60 ? '…' : ''}`,
          `<p>Hi ${m.preferred_name || m.first_name || 'there'},</p><p>${body}</p><p><a href="${appOrigin(community)}/radio">Tune in to Radio</a> for the rest of what's happening around camp ✦</p>`,
        )
        if (result.ok) emailed++
      } catch (err) {
        console.error('[radio notify] email failed:', err)
      }
    }
  }

  return NextResponse.json({ success: true, id, notified, emailed })
}

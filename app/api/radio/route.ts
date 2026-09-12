import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity, type Community } from '@/lib/community'
import { getApprovedMember } from '@/lib/members'
import { parseRadioSources, postRadioEvent } from '@/lib/radio'
import { getNotificationPreferences } from '@/lib/notification-prefs'
import { dispatchMemberNotification } from '@/lib/notify'
import { sendRadioMentionEmail, sendRadioBroadcastEmail } from '@/lib/send-email'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// @here reaches every member — a whole-token match, derived server-side (so a
// typed @here counts even without the composer's autocomplete).
const HERE_RE = /(?:^|\s)@here(?![\w])/i

// POST — a member puts a moment on the air (kind 'voice'). Radio is an open
// airwave (Chanté 2026-07-08): any approved member can share a line, @mention
// another member (rings their bell + email), and — via @here (guarded by a
// confirm in the composer) — notify everyone (bell + email to all members, the
// post marked 📢). One line, no threads, no replies.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const member = await getApprovedMember(community.id, userId)
  if (!member) {
    return NextResponse.json({ error: 'Only approved members can broadcast' }, { status: 403 })
  }

  const { message } = await req.json().catch(() => ({}))
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }
  const notifyAll = HERE_RE.test(message)

  // Source-toggle check inline (not the fire-and-forget helper): the composer
  // is interactive, so a member deserves a real error — a hook can swallow a
  // failed post, a composer must not pretend it landed. This is also the
  // admin's kill switch for open-mic (Admin → Radio → Member voices).
  const { data: configRow } = await db
    .from('page_content')
    .select('value')
    .eq('key', 'config_radio')
    .maybeSingle()
  if (!parseRadioSources(configRow?.value).voice) {
    return NextResponse.json({ error: 'Member posts are currently off' }, { status: 403 })
  }

  const actorName = member.preferred_name || member.first_name || 'A member'
  const body = message.trim().slice(0, 280)

  // A notify-all post carries the megaphone; an ordinary voice, the ✦.
  const id = await postRadioEvent(community.id, {
    kind: 'voice',
    message: body,
    icon: notifyAll ? '📢' : '✦',
    actorClerkId: userId,
    actorName,
    createdBy: userId,
  })
  if (!id) return NextResponse.json({ error: 'Failed to post — try again' }, { status: 500 })

  // Fan out notifications — best-effort, never block the post on them.
  let notified = 0
  let mentioned = 0
  try {
    const result = await fanOut({ community, postId: id, senderId: userId, senderName: actorName, body, notifyAll })
    notified = result.notified
    mentioned = result.mentioned
  } catch (e) {
    console.error('[radio] notify failed', e)
  }

  return NextResponse.json({ success: true, id, notified, mentioned })
}

// Notify the members a post reaches: @mentioned members get a personal ping
// (bell + email under their message preference); a notify-all post rings
// everyone else (bell + email under their announcement preference). Each
// person is reached once — a mentioned member gets the mention, not also the
// broadcast. In-app bell rows are always written; email/push ride the seam,
// which honours each member's preferences.
async function fanOut(opts: {
  community: Community
  postId: string
  senderId: string
  senderName: string
  body: string
  notifyAll: boolean
}): Promise<{ notified: number; mentioned: number }> {
  const { community, postId, senderId, senderName, body, notifyAll } = opts
  const db = tenantDb(community.id)

  const hasMention = body.includes('@')
  if (!notifyAll && !hasMention) return { notified: 0, mentioned: 0 }

  // The audience is every approved member but the sender.
  const { data: membersRaw } = await db
    .from('members')
    .select('clerk_user_id, email, first_name, preferred_name')
    .eq('status', 'approved')
  const audience = (membersRaw ?? []).filter(m => m.clerk_user_id && m.clerk_user_id !== senderId)

  // Whole-token name match ("@Name"), matching the composer's inserted names
  // and the feed's pill highlighting.
  const mentionedRows = hasMention
    ? audience.filter(m => {
        const name = m.preferred_name || m.first_name
        return name ? new RegExp(`@${escapeRegExp(name)}(?![\\w])`, 'i').test(body) : false
      })
    : []
  const mentionedIds = new Set(mentionedRows.map(m => m.clerk_user_id as string))

  // Mentions — personal ping (in-app always; email/push under message pref).
  await Promise.all(mentionedRows.map(async m => {
    const recipientId = m.clerk_user_id as string
    const recipientName = m.preferred_name || m.first_name || 'there'
    const prefs = await getNotificationPreferences(recipientId)
    await db.from('user_notifications').insert({
      clerk_user_id: recipientId,
      event_type: 'radio_mention',
      message: `${senderName} mentioned you on Radio`,
      details: { radioEventId: postId },
    })
    await dispatchMemberNotification(recipientId, {
      kind: 'new_message',
      prefs,
      push: { title: `${community.name} Radio`, body: `${senderName} mentioned you: ${body.slice(0, 120)}`, link: '/radio' },
      email: m.email ? () => sendRadioMentionEmail({ community, to: m.email!, recipientName, senderName, preview: body }) : undefined,
    })
  }))

  // Notify-all — everyone else (in-app always; email/push under announcement pref).
  let notified = 0
  if (notifyAll) {
    const broadcastRecipients = audience.filter(m => !mentionedIds.has(m.clerk_user_id as string))
    const bellRows = broadcastRecipients.map(m => ({
      clerk_user_id: m.clerk_user_id as string,
      event_type: 'radio_broadcast',
      message: body,
      details: { radioEventId: postId },
    }))
    if (bellRows.length) {
      await db.from('user_notifications').insert(bellRows)
      notified = bellRows.length
    }
    await Promise.all(broadcastRecipients.map(async m => {
      const recipientId = m.clerk_user_id as string
      const recipientName = m.preferred_name || m.first_name || 'there'
      const prefs = await getNotificationPreferences(recipientId)
      await dispatchMemberNotification(recipientId, {
        kind: 'announcement',
        prefs,
        push: { title: `${community.name} Radio`, body: `${senderName}: ${body.slice(0, 120)}`, link: '/radio' },
        email: m.email ? () => sendRadioBroadcastEmail({ community, to: m.email!, recipientName, senderName, message: body }) : undefined,
      })
    }))
  }

  return { notified, mentioned: mentionedRows.length }
}

import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity, type Community } from '@/lib/community'
import {
  findGroupConversation,
  getOrCreateGroupConversation,
  isGroupMember,
  markConversationRead,
  visibleToFilter,
  SYSTEM_SENDER,
} from '@/lib/conversations'
import { getApprovedMember } from '@/lib/members'
import { getNotificationPreferences } from '@/lib/notification-prefs'
import { sendGroupMentionEmail, sendGroupActivityEmail } from '@/lib/send-email'
import { dispatchMemberNotification } from '@/lib/notify'

export const dynamic = 'force-dynamic'

// Don't email the same person about mentions in the same group more than once
// per this window (in-app notifications are still created every time).
const MENTION_EMAIL_THROTTLE_MS = 30 * 60 * 1000

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/messages/g/[groupId] — the group's thread (flat, chronological).
// Access is approved group members only: group_members grants the thread, but a
// removed/rejected member's row may outlive their membership window, so the
// approved-status gate runs alongside it.
export async function GET(_req: Request, props: { params: Promise<{ groupId: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  // Membership + approval checks and conversation lookup are independent — run together.
  const [isMember, approvedMember, convId] = await Promise.all([
    isGroupMember(community.id, params.groupId, userId),
    getApprovedMember(community.id, userId),
    findGroupConversation(community.id, params.groupId),
  ])
  if (!isMember || !approvedMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!convId) return NextResponse.json({ messages: [] })

  const { data: msgs, error } = await db
    .from('messages')
    .select('id, sender_clerk_id, body, created_at, sender_name, parent_message_id')
    .eq('conversation_id', convId)
    // Ordinary messages plus MY private system notes (the group welcome) —
    // other members' welcome notes stay invisible.
    .or(visibleToFilter(userId))
    .order('created_at', { ascending: true })

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ messages: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Resolve sender display name + avatar from current profiles, falling back to the
  // snapshot name so messages from departed members stay readable.
  const senderIds = Array.from(new Set((msgs ?? []).map(m => m.sender_clerk_id)))
  const { data: profiles } = senderIds.length
    ? await db
        // Phase 5: identity resolution reads the canonical `members` table.
        .from('members')
        .select('clerk_user_id, first_name, preferred_name, avatar_url')
        .in('clerk_user_id', senderIds)
    : { data: [] }
  const profMap = new Map((profiles ?? []).map(p => [p.clerk_user_id, p]))

  const messages = (msgs ?? []).map(m => {
    const p = profMap.get(m.sender_clerk_id)
    return {
      id: m.id,
      sender_clerk_id: m.sender_clerk_id,
      sender_name: p?.preferred_name || p?.first_name || m.sender_name || 'Member',
      avatar_url: p?.avatar_url ?? null,
      body: m.body,
      created_at: m.created_at,
      parent_message_id: m.parent_message_id ?? null,
    }
  })

  return NextResponse.json({ messages }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST /api/messages/g/[groupId] — post a message to the group thread.
// Quiet by default: ordinary posts create no emails or notification rows — the
// unread badge (last_read_at) is the in-app signal. @mentions are the exception:
// they notify (in-app) and email the mentioned member (see notifyMentions).
export async function POST(req: Request, props: { params: Promise<{ groupId: string }> }) {
  const params = await props.params;
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { body, parentMessageId } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 })
  if (body.trim().length > 2000) return NextResponse.json({ error: 'Message too long' }, { status: 400 })

  // Membership gate, conversation lookup (read-only here — creation waits for
  // the gate), and the sender-name snapshot are independent: one round-trip.
  // The status check mirrors GET: a lingering group_members row must not let a
  // removed/rejected member keep posting.
  const [isMember, existingConvId, { data: senderApp }] = await Promise.all([
    isGroupMember(community.id, params.groupId, userId),
    findGroupConversation(community.id, params.groupId),
    // Snapshot the sender's display name (the messages table has no FK to
    // applications) — status rides along for the approval gate.
    db
      .from('members')
      .select('preferred_name, first_name, status')
      .eq('clerk_user_id', userId)
      .maybeSingle(),
  ])
  if (!isMember || senderApp?.status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const convId = existingConvId ?? (await getOrCreateGroupConversation(community.id, params.groupId))

  // Replies are one level deep: a parent must be a top-level message in this
  // conversation (you can't reply to a reply). System notes (the private
  // welcome) can't be replied to either — a reply would be public while its
  // parent is invisible to everyone else.
  let parent_message_id: string | null = null
  if (parentMessageId) {
    const { data: parent } = await db
      .from('messages')
      .select('id, conversation_id, parent_message_id, sender_clerk_id')
      .eq('id', parentMessageId)
      .maybeSingle()
    if (!parent || parent.conversation_id !== convId || parent.parent_message_id !== null || parent.sender_clerk_id === SYSTEM_SENDER) {
      return NextResponse.json({ error: 'Invalid parent message' }, { status: 400 })
    }
    parent_message_id = parentMessageId
  }

  const senderName = senderApp?.preferred_name || senderApp?.first_name || 'A member'

  const { data: message, error } = await db
    .from('messages')
    .insert({ conversation_id: convId, sender_clerk_id: userId, sender_name: senderName, body: body.trim(), parent_message_id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Read-cursor bump ("I've seen everything up to my own post") and the notify
  // chain are independent — run together. @mentions pierce the quiet default:
  // notify (in-app) + email the mentioned members. Opted-in members get a
  // throttled activity email. Best-effort — never block the post on notifications.
  await Promise.all([
    markConversationRead(community.id, convId, userId),
    (async () => {
      try {
        const mentionedIds = await notifyMentions({
          community,
          groupId: params.groupId,
          messageId: message.id,
          senderId: userId,
          senderName,
          body: body.trim(),
        })
        await notifyOptedIn({
          community,
          groupId: params.groupId,
          conversationId: convId,
          messageCreatedAt: message.created_at,
          senderId: userId,
          senderName,
          body: body.trim(),
          excludeIds: mentionedIds,
        })
      } catch (err) {
        console.error('[group message] notify failed:', err)
      }
    })(),
  ])

  return NextResponse.json({ message })
}

// Parse @mentions of group members out of the body and notify them. Mentions are
// matched against current member display names (the autocomplete inserts the exact
// name), so this also catches mentions typed in replies (which have no autocomplete).
async function notifyMentions(opts: {
  community: Community
  groupId: string
  messageId: string
  senderId: string
  senderName: string
  body: string
}): Promise<string[]> {
  const { community, groupId, messageId, senderId, senderName, body } = opts
  if (!body.includes('@')) return [] // fast path: no mentions possible
  const db = tenantDb(community.id)

  // Group roster and group name are independent — one round-trip.
  const [{ data: memberRows }, { data: group }] = await Promise.all([
    db.from('group_members').select('clerk_user_id').eq('group_id', groupId),
    db.from('groups').select('name').eq('id', groupId).maybeSingle(),
  ])
  // Group members other than the sender.
  const memberIds = (memberRows ?? []).map(r => r.clerk_user_id).filter(id => id && id !== senderId)
  if (!memberIds.length) return []

  const { data: apps } = await db
    .from('members')
    .select('clerk_user_id, first_name, preferred_name, email')
    .in('clerk_user_id', memberIds)

  // Which members are mentioned (whole-token match on "@Name").
  const mentioned = (apps ?? []).filter(a => {
    const name = a.preferred_name || a.first_name
    if (!name) return false
    return new RegExp(`@${escapeRegExp(name)}(?![\\w])`, 'i').test(body)
  })
  if (!mentioned.length) return []

  const groupName = group?.name || 'a group'
  const since = new Date(Date.now() - MENTION_EMAIL_THROTTLE_MS).toISOString()

  // Each mentioned member's notification work is independent — run in parallel
  // (emails come from the member row; no per-recipient Clerk round-trips).
  await Promise.all(mentioned.map(async a => {
    const recipientId = a.clerk_user_id
    const recipientName = a.preferred_name || a.first_name || 'there'

    // Throttle email (look for a prior mention notification before creating this
    // one) and the email preference — independent checks.
    const [{ data: recent }, prefs] = await Promise.all([
      db
        .from('user_notifications')
        .select('id')
        .eq('clerk_user_id', recipientId)
        .eq('event_type', 'group_mention')
        .eq('details->>groupId', groupId)
        .gte('created_at', since)
        .limit(1),
      getNotificationPreferences(recipientId),
    ])
    const throttled = !!(recent && recent.length)

    // In-app notification — always.
    await db.from('user_notifications').insert({
      clerk_user_id: recipientId,
      event_type: 'group_mention',
      message: `${senderName} mentioned you in ${groupName}`,
      details: { groupId, messageId },
    })

    // Push per mention + email under the mention throttle, both through the
    // seam (which gates the two channels on the message preference).
    await dispatchMemberNotification(recipientId, {
      kind: 'new_message',
      prefs,
      push: {
        title: groupName,
        body: `${senderName} mentioned you: ${body.slice(0, 120)}`,
        link: `/messages/g/${groupId}`,
      },
      email:
        throttled || !a.email
          ? undefined
          : () => sendGroupMentionEmail({ community, to: a.email!, recipientName, senderName, groupName, groupId, preview: body }),
    })
  }))

  return mentioned.map(a => a.clerk_user_id)
}

// Email members who opted into this thread's emails. Throttled per *conversation*:
// only fires when the thread was quiet (no prior message within the window), so a
// burst of messages yields one nudge rather than per-message spam. `excludeIds` are
// the just-mentioned members (already emailed).
async function notifyOptedIn(opts: {
  community: Community
  groupId: string
  conversationId: string
  messageCreatedAt: string
  senderId: string
  senderName: string
  body: string
  excludeIds: string[]
}) {
  const { community, groupId, conversationId, messageCreatedAt, senderId, senderName, body, excludeIds } = opts
  const db = tenantDb(community.id)

  // Opted-in participants, the per-conversation burst throttle, and the group
  // name are independent — one round-trip.
  const since = new Date(Date.now() - MENTION_EMAIL_THROTTLE_MS).toISOString()
  const [{ data: optedIn }, { data: priorBurst }, { data: group }] = await Promise.all([
    // Opted-in participants other than the sender (and not already mentioned).
    db
      .from('conversation_participants')
      .select('clerk_user_id')
      .eq('conversation_id', conversationId)
      .eq('email_opt_in', true)
      .neq('clerk_user_id', senderId),
    // Per-conversation throttle: skip if there was another message in the window.
    db
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .lt('created_at', messageCreatedAt)
      .gte('created_at', since)
      .limit(1),
    db.from('groups').select('name').eq('id', groupId).maybeSingle(),
  ])
  const exclude = new Set([...excludeIds, senderId])
  const recipientIds = (optedIn ?? []).map(p => p.clerk_user_id).filter(id => id && !exclude.has(id))
  if (!recipientIds.length) return
  if (priorBurst && priorBurst.length) return

  const groupName = group?.name || 'a group'
  const { data: apps } = await db
    .from('members')
    .select('clerk_user_id, first_name, preferred_name, email')
    .in('clerk_user_id', recipientIds)
  const memberById = new Map((apps ?? []).map(a => [a.clerk_user_id, a]))

  // Recipients are independent — run in parallel (emails come from the member
  // row; no per-recipient Clerk round-trips).
  await Promise.all(recipientIds.map(async recipientId => {
    try {
      const m = memberById.get(recipientId)
      const recipientName = m?.preferred_name || m?.first_name || 'there'
      // Both channels ride the per-conversation burst throttle above — a busy
      // thread buzzes once, not per message (these are opt-in thread updates,
      // not personal mentions).
      await dispatchMemberNotification(recipientId, {
        kind: 'new_message',
        push: {
          title: groupName,
          body: `${senderName}: ${body.slice(0, 120)}`,
          link: `/messages/g/${groupId}`,
        },
        email: m?.email
          ? () => sendGroupActivityEmail({ community, to: m.email!, recipientName, senderName, groupName, groupId, preview: body })
          : undefined,
      })
    } catch (err) {
      console.error('[group message] opt-in notification failed:', err)
    }
  }))
}

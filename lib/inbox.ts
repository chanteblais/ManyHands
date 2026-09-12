import { tenantDb } from './tenant-db'
import { getMyConversations, findDirectConversation, visibleToFilter } from './conversations'

// Read-side helpers for the messages UI, shared by the API routes and the
// server pages. The pages call these directly so the inbox / thread renders
// with its data already in place (no client fetch-after-hydration waterfall);
// the API routes remain the refresh/poll path.

export type InboxConversation = {
  kind: 'direct' | 'group'
  otherUserId?: string | null // direct
  groupId?: string | null // group
  displayName: string
  avatarUrl: string | null
  icon: string | null
  iconImage: string | null // group: uploaded icon art (takes precedence over the emoji glyph)
  muted: boolean
  lastMessage: string | null
  lastMessageAt: string | null
  lastMessageFromMe: boolean
  unreadCount: number
}

// Inbox: one row per conversation, most recent message first. Direct
// conversations appear only once they have messages (legacy behavior); group
// conversations always appear for groups the member belongs to, so an empty
// group still has an entry point.
export async function getInboxConversations(communityId: string, userId: string): Promise<InboxConversation[]> {
  const db = tenantDb(communityId)
  let convs
  try {
    convs = await getMyConversations(communityId, userId)
  } catch {
    return []
  }
  if (!convs.length) return []

  const convById = new Map(convs.map(c => [c.conversationId, c]))
  const groupIds = convs.filter(c => c.type === 'group' && c.groupId).map(c => c.groupId as string)
  const otherIds = convs.filter(c => c.type === 'direct' && c.otherUserId).map(c => c.otherUserId as string)

  // The three lookups only depend on the conversation list — run them together.
  const [msgsRes, groupsRes, profilesRes] = await Promise.all([
    // All messages across my conversations that I may see (ordinary messages
    // plus my own private welcome notes), newest first.
    db
      .from('messages')
      .select('conversation_id, sender_clerk_id, body, created_at, sender_name')
      .in('conversation_id', convs.map(c => c.conversationId))
      .or(visibleToFilter(userId))
      .order('created_at', { ascending: false }),
    // Group names/icons.
    groupIds.length
      ? db.from('groups').select('id, name, icon, icon_image').in('id', groupIds)
      : Promise.resolve({ data: [] }),
    // Profiles for the other party in each direct conversation.
    // Phase 5: identity resolution reads the canonical `members` table.
    otherIds.length
      ? db
          .from('members')
          .select('clerk_user_id, first_name, preferred_name, avatar_url')
          .in('clerk_user_id', otherIds)
          .eq('status', 'approved')
      : Promise.resolve({ data: [] }),
  ])

  // Per-conversation summary (last message + unread + other-party snapshot name).
  type Summary = { lastBody: string; lastAt: string; lastFromMe: boolean; unread: number; otherName: string | null }
  const sumByConv = new Map<string, Summary>()
  for (const m of msgsRes.data ?? []) {
    const conv = convById.get(m.conversation_id)
    if (!conv) continue
    let s = sumByConv.get(m.conversation_id)
    if (!s) {
      // Newest-first, so the first message seen is the conversation's last.
      s = { lastBody: m.body, lastAt: m.created_at, lastFromMe: m.sender_clerk_id === userId, unread: 0, otherName: null }
      sumByConv.set(m.conversation_id, s)
    }
    if (conv.type === 'direct' && m.sender_clerk_id === conv.otherUserId && !s.otherName) {
      s.otherName = m.sender_name ?? null
    }
    if (m.sender_clerk_id !== userId) {
      if (!conv.lastReadAt || new Date(m.created_at) > new Date(conv.lastReadAt)) s.unread++
    }
  }

  const groupById = new Map((groupsRes.data ?? []).map(g => [g.id, g]))
  const profileMap = new Map((profilesRes.data ?? []).map(p => [p.clerk_user_id, p]))

  const rows: InboxConversation[] = convs.map(conv => {
    const s = sumByConv.get(conv.conversationId)
    const unreadCount = conv.muted ? 0 : (s?.unread ?? 0) // muted threads don't badge
    if (conv.type === 'group') {
      const g = conv.groupId ? groupById.get(conv.groupId) : null
      return {
        kind: 'group' as const,
        groupId: conv.groupId,
        displayName: g?.name ?? 'Group',
        icon: g?.icon ?? null,
        iconImage: g?.icon_image ?? null,
        avatarUrl: null,
        muted: conv.muted,
        lastMessage: s?.lastBody ?? null,
        lastMessageAt: s?.lastAt ?? null,
        lastMessageFromMe: s?.lastFromMe ?? false,
        unreadCount,
      }
    }
    const prof = conv.otherUserId ? profileMap.get(conv.otherUserId) : null
    return {
      kind: 'direct' as const,
      otherUserId: conv.otherUserId,
      displayName: prof?.preferred_name || prof?.first_name || s?.otherName || 'Member',
      avatarUrl: prof?.avatar_url ?? null,
      icon: null,
      iconImage: null,
      muted: conv.muted,
      lastMessage: s?.lastBody ?? null,
      lastMessageAt: s?.lastAt ?? null,
      lastMessageFromMe: s?.lastFromMe ?? false,
      unreadCount,
    }
  })

  // Direct conversations with no messages don't show; groups always do.
  return rows
    .filter(r => r.kind === 'group' || r.lastMessageAt != null)
    .sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
      if (a.lastMessageAt) return -1
      if (b.lastMessageAt) return 1
      return a.displayName.localeCompare(b.displayName)
    })
}

export type ThreadMessage = {
  id: string
  sender_clerk_id: string
  recipient_clerk_id: string
  body: string
  read: boolean
  read_at: string | null
  created_at: string
}

// The DM thread between two users, chronological, with read receipts derived
// from the recipient's last_read_at cursor.
export async function getDirectThreadMessages(communityId: string, myId: string, otherId: string): Promise<ThreadMessage[]> {
  const db = tenantDb(communityId)
  const convId = await findDirectConversation(communityId, myId, otherId)
  if (!convId) return []

  // Messages and read cursors are independent — run them together.
  const [msgsRes, partsRes] = await Promise.all([
    db
      .from('messages')
      .select('id, sender_clerk_id, recipient_clerk_id, body, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true }),
    db
      .from('conversation_participants')
      .select('clerk_user_id, last_read_at')
      .eq('conversation_id', convId),
  ])

  if (msgsRes.error) {
    if (msgsRes.error.code === '42P01') return []
    throw msgsRes.error
  }

  const lastReadBy = new Map((partsRes.data ?? []).map(p => [p.clerk_user_id, p.last_read_at as string | null]))

  // A message is "read" once its recipient's last_read_at is at or past the
  // message's timestamp.
  return (msgsRes.data ?? []).map(m => {
    const recipientId = m.sender_clerk_id === myId ? otherId : myId
    const lr = lastReadBy.get(recipientId)
    const read = !!lr && new Date(m.created_at) <= new Date(lr)
    return {
      id: m.id,
      sender_clerk_id: m.sender_clerk_id,
      recipient_clerk_id: m.recipient_clerk_id ?? recipientId,
      body: m.body,
      read,
      read_at: read ? lr : null,
      created_at: m.created_at,
    }
  })
}

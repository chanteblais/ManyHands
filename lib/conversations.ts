import { tenantDb } from './tenant-db'

// Helpers for the conversations model (group messaging — see docs/group-messaging.md).
// Phase 2 uses these to back the existing 1:1 DM endpoints; group threads come later.

// Stable key for a direct (1:1) conversation: the two clerk ids, sorted and joined.
// Mirrors the `direct_key` column + its unique index, so each unordered pair maps to
// exactly one conversation.
export function directKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

// Find the existing direct conversation between two users, or null. Does not create.
export async function findDirectConversation(communityId: string, a: string, b: string): Promise<string | null> {
  const { data } = await tenantDb(communityId)
    .from('conversations')
    .select('id')
    .eq('direct_key', directKey(a, b))
    .maybeSingle()
  return data?.id ?? null
}

// Resolve-or-create the direct conversation between two users, ensuring both are
// participants. Idempotent and race-safe (the unique index on direct_key is the
// source of truth).
export async function getOrCreateDirectConversation(communityId: string, a: string, b: string): Promise<string> {
  const db = tenantDb(communityId)
  const key = directKey(a, b)

  const existing = await findDirectConversation(communityId, a, b)
  let convId: string

  if (existing) {
    convId = existing
  } else {
    const { data: created, error } = await db
      .from('conversations')
      .insert({ type: 'direct', direct_key: key })
      .select('id')
      .single()
    if (error) {
      // Likely a concurrent insert hit the unique index first — re-read.
      const again = await findDirectConversation(communityId, a, b)
      if (!again) throw error
      convId = again
    } else {
      convId = created.id
    }
  }

  // Ensure both participants exist; never clobber existing last_read_at.
  await db.from('conversation_participants').upsert(
    [
      { conversation_id: convId, clerk_user_id: a },
      { conversation_id: convId, clerk_user_id: b },
    ],
    { onConflict: 'conversation_id,clerk_user_id', ignoreDuplicates: true },
  )

  return convId
}

// ── Group conversation helpers ───────────────────────────────────────────────

// The conversation bound to a group, or null. (One per group.)
export async function findGroupConversation(communityId: string, groupId: string): Promise<string | null> {
  const { data } = await tenantDb(communityId)
    .from('conversations')
    .select('id')
    .eq('type', 'group')
    .eq('group_id', groupId)
    .maybeSingle()
  return data?.id ?? null
}

// The group's conversation, creating it if missing. Used on group creation and as
// a fallback on thread access (existing groups got theirs in migration 033).
export async function getOrCreateGroupConversation(communityId: string, groupId: string): Promise<string> {
  const existing = await findGroupConversation(communityId, groupId)
  if (existing) return existing
  const { data, error } = await tenantDb(communityId)
    .from('conversations')
    .insert({ type: 'group', group_id: groupId })
    .select('id')
    .single()
  if (error) {
    const again = await findGroupConversation(communityId, groupId)
    if (!again) throw error
    return again
  }
  return data.id
}

// Sentinel sender for system-authored notes (the per-member group welcome).
// Not a clerk id, so profile resolution simply finds no profile for it and
// unread counting treats it like any other-party sender.
export const SYSTEM_SENDER = 'system'

// PostgREST .or() filter limiting message reads to what this user may see:
// ordinary messages (visible_to IS NULL) plus their own private system notes.
// Every message reader that serves a member must apply this (thread GET,
// inbox summaries, unread count) — requires migration 071.
export function visibleToFilter(userId: string): string {
  return `visible_to.is.null,visible_to.eq.${userId}`
}

// Drop a private welcome note into the group's thread for a newly added member.
// Only that member sees it (visible_to), and it lands unread, so the message
// badge makes them aware of the membership — quiet otherwise: no email, no
// notification rows, invisible to everyone else. Idempotent per (group, member);
// removal paths delete the note (deleteGroupWelcome) so a re-add re-welcomes.
// Best-effort: a failure here must never block the membership write it follows.
// Keep the body in sync with the migration 071 backfill.
export async function sendGroupWelcome(communityId: string, groupId: string, userId: string): Promise<void> {
  try {
    const db = tenantDb(communityId)
    const [{ data: group }, convId] = await Promise.all([
      db.from('groups').select('name').eq('id', groupId).maybeSingle(),
      getOrCreateGroupConversation(communityId, groupId),
    ])
    if (!group) return
    const { data: existing } = await db
      .from('messages')
      .select('id')
      .eq('conversation_id', convId)
      .eq('sender_clerk_id', SYSTEM_SENDER)
      .eq('visible_to', userId)
      .limit(1)
    if (existing?.length) return
    await db.from('messages').insert({
      conversation_id: convId,
      sender_clerk_id: SYSTEM_SENDER,
      sender_name: group.name,
      body: `Welcome to ${group.name}! ✦ You're a member of this group — this is its message thread.`,
      visible_to: userId,
    })
  } catch (err) {
    console.error('[group welcome] failed:', err)
  }
}

// Remove a member's private welcome note(s) — every path that deletes
// group_members rows must call this, or sendGroupWelcome's idempotence finds the
// stale note and the re-add is silently welcome-less. Omit groupId to clear
// across all groups (member removal / rejection / suspension).
export async function deleteGroupWelcome(communityId: string, userId: string, groupId?: string): Promise<void> {
  try {
    let query = tenantDb(communityId)
      .from('messages')
      .delete()
      .eq('sender_clerk_id', SYSTEM_SENDER)
      .eq('visible_to', userId)
    if (groupId) {
      const convId = await findGroupConversation(communityId, groupId)
      if (!convId) return
      query = query.eq('conversation_id', convId)
    }
    await query
  } catch (err) {
    console.error('[group welcome] cleanup failed:', err)
  }
}

export async function isGroupMember(communityId: string, groupId: string, userId: string): Promise<boolean> {
  const { data } = await tenantDb(communityId)
    .from('group_members')
    .select('clerk_user_id')
    .eq('group_id', groupId)
    .eq('clerk_user_id', userId)
    .maybeSingle()
  return !!data
}

// Advance a user's read cursor to now, creating their participant row if needed
// (group participant rows are created lazily on first read/post). Only sets
// last_read_at — muted / email_opt_in keep their existing values on conflict.
export async function markConversationRead(communityId: string, conversationId: string, userId: string): Promise<void> {
  await tenantDb(communityId).from('conversation_participants').upsert(
    { conversation_id: conversationId, clerk_user_id: userId, last_read_at: new Date().toISOString() },
    { onConflict: 'conversation_id,clerk_user_id' },
  )
}

// ── My conversations ─────────────────────────────────────────────────────────

export type MyConversation = {
  conversationId: string
  type: 'direct' | 'group'
  lastReadAt: string | null
  muted: boolean
  groupId?: string
  otherUserId?: string // direct only
}

// Read/write a participant's per-conversation prefs (mute / email opt-in). The
// upsert only touches the supplied keys, so it never clobbers last_read_at.
export async function setParticipantPrefs(
  communityId: string,
  conversationId: string,
  userId: string,
  prefs: { muted?: boolean; email_opt_in?: boolean },
): Promise<void> {
  await tenantDb(communityId).from('conversation_participants').upsert(
    { conversation_id: conversationId, clerk_user_id: userId, ...prefs },
    { onConflict: 'conversation_id,clerk_user_id' },
  )
}

export async function getParticipantPrefs(
  communityId: string,
  conversationId: string,
  userId: string,
): Promise<{ muted: boolean; email_opt_in: boolean }> {
  const { data } = await tenantDb(communityId)
    .from('conversation_participants')
    .select('muted, email_opt_in')
    .eq('conversation_id', conversationId)
    .eq('clerk_user_id', userId)
    .maybeSingle()
  return { muted: data?.muted ?? false, email_opt_in: data?.email_opt_in ?? false }
}

// Every conversation the user takes part in, with their read cursor.
// Direct conversations come from participant rows; group conversations are derived
// from group membership (the source of truth) so a newly added member sees their
// group even before a participant row exists.
export async function getMyConversations(communityId: string, userId: string): Promise<MyConversation[]> {
  const db = tenantDb(communityId)
  // My participant rows and my group memberships are independent — fetch together.
  const [{ data: parts, error }, { data: myGroups }] = await Promise.all([
    db
      .from('conversation_participants')
      .select('conversation_id, last_read_at, muted')
      .eq('clerk_user_id', userId),
    db
      .from('group_members')
      .select('group_id')
      .eq('clerk_user_id', userId),
  ])
  if (error && error.code !== '42P01') throw error
  const lastReadByConv = new Map((parts ?? []).map(p => [p.conversation_id, p.last_read_at as string | null]))
  const mutedByConv = new Map((parts ?? []).map(p => [p.conversation_id, !!p.muted]))

  const partIds = (parts ?? []).map(p => p.conversation_id)
  const groupIds = (myGroups ?? []).map(g => g.group_id)

  // Resolve conversation rows — direct (from participant rows), group (from
  // membership), and the other participants of my conversations are all
  // independent of each other. The "others" query scans all my conversations
  // rather than just the direct ones (which aren't known yet) so it can join
  // this batch; only direct rows read from it below.
  const [directConvsRes, groupConvsRes, othersRes] = await Promise.all([
    partIds.length
      ? db.from('conversations').select('id').eq('type', 'direct').in('id', partIds)
      : Promise.resolve({ data: [] }),
    groupIds.length
      ? db.from('conversations').select('id, group_id').eq('type', 'group').in('group_id', groupIds)
      : Promise.resolve({ data: [] }),
    partIds.length
      ? db
          .from('conversation_participants')
          .select('conversation_id, clerk_user_id')
          .in('conversation_id', partIds)
          .neq('clerk_user_id', userId)
      : Promise.resolve({ data: [] }),
  ])

  const result: MyConversation[] = []

  // Direct conversations — resolve the other participant of each.
  const directIds = (directConvsRes.data ?? []).map(c => c.id)
  if (directIds.length) {
    const otherByConv = new Map((othersRes.data ?? []).map(o => [o.conversation_id, o.clerk_user_id]))
    for (const id of directIds) {
      result.push({ conversationId: id, type: 'direct', lastReadAt: lastReadByConv.get(id) ?? null, muted: mutedByConv.get(id) ?? false, otherUserId: otherByConv.get(id) })
    }
  }

  for (const gc of groupConvsRes.data ?? []) {
    result.push({ conversationId: gc.id, type: 'group', lastReadAt: lastReadByConv.get(gc.id) ?? null, muted: mutedByConv.get(gc.id) ?? false, groupId: gc.group_id as string })
  }

  return result
}

// Total unread across all of a user's conversations (direct + group): messages they
// didn't send, created after their per-conversation read cursor.
export async function getUnreadCount(communityId: string, userId: string): Promise<number> {
  const convs = (await getMyConversations(communityId, userId)).filter(c => !c.muted) // muted threads don't badge
  if (!convs.length) return 0

  const lastReadByConv = new Map(convs.map(c => [c.conversationId, c.lastReadAt]))
  // This runs on the nav's 30s unread poll — bound the scan to messages newer
  // than the oldest read cursor instead of every message ever, unless some
  // conversation has never been read (null cursor = everything counts).
  const cursors = convs.map(c => c.lastReadAt)
  const oldestCursor = cursors.every((c): c is string => !!c)
    ? cursors.reduce((a, b) => (a < b ? a : b))
    : null
  let query = tenantDb(communityId)
    .from('messages')
    .select('conversation_id, created_at')
    .in('conversation_id', convs.map(c => c.conversationId))
    .neq('sender_clerk_id', userId)
    .or(visibleToFilter(userId)) // others' private welcome notes don't count
  if (oldestCursor) query = query.gt('created_at', oldestCursor)
  const { data: msgs } = await query
  if (!msgs?.length) return 0

  let count = 0
  for (const m of msgs) {
    const lr = lastReadByConv.get(m.conversation_id)
    if (!lr || new Date(m.created_at) > new Date(lr)) count++
  }
  return count
}

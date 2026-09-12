import { HandsBackdrop } from '@/components/HandsBackdrop'
import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { getDirectThreadMessages } from '@/lib/inbox'
import { getApprovedMember } from '@/lib/members'
import { getCommunity } from '@/lib/community'
import { Header } from '@/components/Header'
import { ThreadClient } from './ThreadClient'
import { supabaseResizedUrl } from '@/lib/supabase-image'

export default async function ThreadPage(props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
  const { userId: myId } = await auth()
  if (!myId) redirect('/sign-in')
  const community = await getCommunity()

  // Can't message yourself
  if (params.userId === myId) redirect('/messages')

  // The access check, the recipient profile, and the initial thread are
  // independent reads — run them together so the thread paints with its
  // messages already in place (the client keeps polling for new ones).
  const [me, { data: other }, initialMessages] = await Promise.all([
    // Auth: only approved members — canonical gate (members table + email
    // fallback; see app/messages/page.tsx).
    getApprovedMember(community.id, myId),
    // Recipient profile
    supabaseAdmin
      .from('members')
      .select('clerk_user_id, first_name, preferred_name, avatar_url, pronouns')
      .eq('clerk_user_id', params.userId)
      .eq('status', 'approved')
      .maybeSingle(),
    getDirectThreadMessages(myId, params.userId).catch(() => null),
  ])

  if (!me) redirect('/profile')

  // The other member may have been removed (deleted / no longer approved). Rather
  // than 404, still show the existing conversation read-only — but only if there's
  // actually message history (otherwise this is a genuinely invalid link).
  let recipientActive = true
  let displayName: string
  let avatarUrl: string | null
  let pronouns: string | null

  if (other) {
    displayName = other.preferred_name || other.first_name || 'Member'
    avatarUrl = supabaseResizedUrl(other.avatar_url ?? null, 160) ?? null
    pronouns = other.pronouns ?? null
  } else {
    // Find the most recent message they sent us — its snapshot name (and the
    // existence check) tells us whether to render the thread read-only. They
    // may have only ever received messages from us — still allow the thread
    // if any history exists in either direction.
    const [{ data: lastFromThem }, { count }] = await Promise.all([
      supabaseAdmin
        .from('messages')
        .select('sender_name')
        .eq('sender_clerk_id', params.userId)
        .eq('recipient_clerk_id', myId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .or(
          `and(sender_clerk_id.eq.${myId},recipient_clerk_id.eq.${params.userId}),and(sender_clerk_id.eq.${params.userId},recipient_clerk_id.eq.${myId})`
        ),
    ])
    if (!count) notFound()
    recipientActive = false
    displayName = lastFromThem?.sender_name || 'Former member'
    avatarUrl = null
    pronouns = null
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
      <Header />
      <HandsBackdrop opacity={0.6} />
      <ThreadClient
        currentUserId={myId}
        recipientId={params.userId}
        displayName={displayName}
        avatarUrl={avatarUrl}
        pronouns={pronouns}
        recipientActive={recipientActive}
        initialMessages={initialMessages ?? undefined}
      />
    </div>
  )
}

import { HandsBackdrop } from '@/components/HandsBackdrop'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { getInboxConversations } from '@/lib/inbox'
import { getApprovedMember } from '@/lib/members'
import { getCommunity } from '@/lib/community'
import { Header } from '@/components/Header'
import { MessagesInboxClient } from './MessagesInboxClient'
import { UnreadCountBadge } from './UnreadCountBadge'

export type MemberOption = {
  userId: string
  displayName: string
  avatarUrl: string | null
}

export default async function MessagesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  // The access check, the "New Message" member picker, and the initial inbox
  // are independent reads — run them together (the page renders with the inbox
  // already in place; the client only re-fetches to stay fresh).
  const [me, { data: members }, initialConversations] = await Promise.all([
    // Only approved members — the canonical gate (members table + email
    // fallback). The old raw applications-by-clerk-id query bounced localhost
    // dev-instance sessions, whose Clerk id predates the 059 prod remap.
    getApprovedMember(community.id, userId),
    // All other approved members for the "New Message" picker
    // Phase 5: identity resolution reads the canonical `members` table.
    db
      .from('members')
      .select('clerk_user_id, first_name, preferred_name, avatar_url')
      .eq('status', 'approved')
      .neq('clerk_user_id', userId)
      .order('first_name', { ascending: true }),
    getInboxConversations(community.id, userId),
  ])

  if (!me) redirect('/profile')

  const memberOptions: MemberOption[] = (members ?? [])
    .filter(m => m.clerk_user_id)
    .map(m => ({
      userId: m.clerk_user_id!,
      displayName: m.preferred_name || m.first_name || 'Member',
      avatarUrl: m.avatar_url ?? null,
    }))

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      <Header />
      <HandsBackdrop />
      <main aria-labelledby="messages-heading" style={{ maxWidth: '720px', margin: '0 auto', padding: '4.5rem 1.5rem 3rem', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
          <div>
            <p style={{ fontSize: '0.65rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#D239F8', opacity: 0.7, marginBottom: '0.4rem' }}>
              <span aria-hidden="true">✦ &nbsp;</span>Messages<span aria-hidden="true">&nbsp; ✦</span>
            </p>
            <h1 id="messages-heading" style={{ display: 'flex', alignItems: 'center', fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', color: '#C8A848', margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
              Messages
              <UnreadCountBadge />
            </h1>
          </div>
        </div>
        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(200,168,72,0.3), transparent)', marginBottom: '2.5rem' }} aria-hidden="true" />
        <MessagesInboxClient currentUserId={userId} members={memberOptions} initialConversations={initialConversations} />
      </main>
    </div>
  )
}

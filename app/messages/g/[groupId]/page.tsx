import { HandsBackdrop } from '@/components/HandsBackdrop'
import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { Header } from '@/components/Header'
import { findGroupConversation, getParticipantPrefs } from '@/lib/conversations'
import { getApprovedMember } from '@/lib/members'
import { getCommunity } from '@/lib/community'
import { GroupThreadClient } from './GroupThreadClient'

export default async function GroupThreadPage(props: { params: Promise<{ groupId: string }> }) {
  const params = await props.params;
  const { userId: myId } = await auth()
  if (!myId) redirect('/sign-in')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  // The access check, group row, roster, and conversation lookup are
  // independent reads — run them together.
  const [me, { data: group }, { data: roster }, convId] = await Promise.all([
    // Approved members only — canonical gate (members table + email fallback;
    // see app/messages/page.tsx).
    getApprovedMember(community.id, myId),
    // The group must exist…
    db
      .from('groups')
      .select('id, name, icon, icon_image, join_policy')
      .eq('id', params.groupId)
      .maybeSingle(),
    // …and group threads are members-only.
    db
      .from('group_members')
      .select('clerk_user_id')
      .eq('group_id', params.groupId),
    findGroupConversation(community.id, params.groupId),
  ])

  if (!me) redirect('/profile')
  if (!group) notFound()
  const memberIds = (roster ?? []).map(r => r.clerk_user_id).filter(Boolean)
  if (!memberIds.includes(myId)) redirect('/messages')

  // Member profiles (for @mention autocomplete + highlighting — includes me so
  // a mention of me renders highlighted too) and my per-thread prefs.
  const [memberAppsRes, prefs] = await Promise.all([
    memberIds.length
      ? db
          .from('members')
          .select('clerk_user_id, first_name, preferred_name, avatar_url')
          .in('clerk_user_id', memberIds)
          .eq('status', 'approved')
      : Promise.resolve({ data: [] }),
    convId ? getParticipantPrefs(community.id, convId, myId) : Promise.resolve({ muted: false, email_opt_in: false }),
  ])
  const members = (memberAppsRes.data ?? []).map(a => ({
    userId: a.clerk_user_id as string,
    displayName: a.preferred_name || a.first_name || 'Member',
    avatarUrl: a.avatar_url ?? null,
  }))

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
      <Header />
      <HandsBackdrop opacity={0.6} />
      <GroupThreadClient
        currentUserId={myId}
        groupId={group.id}
        groupName={group.name}
        groupIcon={group.icon}
        groupIconImage={group.icon_image}
        members={members}
        canLeave={group.join_policy === 'open'}
        initialMuted={prefs.muted}
        initialEmailOptIn={prefs.email_opt_in}
      />
    </div>
  )
}

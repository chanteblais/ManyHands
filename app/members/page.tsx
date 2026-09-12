import { HandsBackdrop } from '@/components/HandsBackdrop'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getApprovedMember } from '@/lib/members'
import { Header } from '@/components/Header'
import { MembersGrid, type MemberCard, type VolunteerCard } from './MembersGrid'

export default async function MembersPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  // The viewer gate (approved members only) runs alongside the directory
  // queries — it gates the response, not what we fetch.
  const [viewer, { data: members }, { data: signups }, { data: volunteerRows }] = await Promise.all([
    getApprovedMember(community.id, userId),
    db
      .from('applications')
      .select('id, first_name, preferred_name, avatar_url, clerk_user_id, email')
      .eq('status', 'approved')
      .order('first_name', { ascending: true }),
    db
      .from('camp_signups')
      .select('clerk_user_id, role_approval_status, roles ( name, departments ( name, icon ) )'),
    db
      .from('volunteers')
      .select('id, first_name, preferred_name, avatar_url, clerk_user_id, email')
      .eq('status', 'active')
      .order('first_name', { ascending: true }),
  ])

  if (!viewer) redirect('/profile')

  const signupByUser = Object.fromEntries(
    (signups ?? []).map(s => [s.clerk_user_id, s])
  )

  const all: MemberCard[] = (members ?? []).map(m => {
    const signup = m.clerk_user_id ? signupByUser[m.clerk_user_id] : null
    const role = signup?.roles as { name?: string; departments?: { name?: string; icon?: string } | null } | null
    return {
      id: m.clerk_user_id ?? m.id,
      dbId: m.id,
      name: m.preferred_name || m.first_name || 'Member',
      avatarUrl: m.avatar_url ?? null,
      roleName: role?.name ?? null,
      deptName: role?.departments?.name ?? null,
      roleApprovalStatus: signup?.role_approval_status ?? null,
    }
  })

  // Active volunteers, minus anyone already listed as an approved member
  // (a person can hold both records — the member card wins).
  const memberUserIds = new Set((members ?? []).map(m => m.clerk_user_id).filter(Boolean))
  const memberEmails = new Set((members ?? []).map(m => m.email?.toLowerCase()).filter(Boolean))
  const volunteers: VolunteerCard[] = (volunteerRows ?? [])
    .filter(v =>
      !(v.clerk_user_id && memberUserIds.has(v.clerk_user_id)) &&
      !(v.email && memberEmails.has(v.email.toLowerCase()))
    )
    .map(v => ({
      dbId: v.id,
      name: v.preferred_name || v.first_name || 'Volunteer',
      avatarUrl: v.avatar_url ?? null,
    }))

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1, overflow: 'hidden' }}>
      <Header />
      <HandsBackdrop />

      <main aria-labelledby="members-heading" style={{ maxWidth: '960px', margin: '0 auto', padding: '6rem 1.5rem 6rem', position: 'relative', zIndex: 1 }}>

        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <p style={{ fontSize: '0.65rem', letterSpacing: '0.3em', textTransform: 'uppercase', color: '#D239F8', opacity: 0.7, marginBottom: '0.5rem' }}>
            <span aria-hidden="true">✦ &nbsp;</span>{community.name} Camp 2026<span aria-hidden="true">&nbsp; ✦</span>
          </p>
          <h1 id="members-heading" style={{ fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(2rem, 6vw, 3rem)', color: '#C8A848', marginBottom: '0.25rem', textShadow: '0 0 40px rgba(210,57,248,0.4)' }}>
            Many Hands
          </h1>
          <p style={{ fontSize: '0.85rem', opacity: 0.4 }}>
            {all.length} approved {all.length === 1 ? 'member' : 'members'}
            {volunteers.length > 0 && <> · {volunteers.length} {volunteers.length === 1 ? 'volunteer' : 'volunteers'}</>}
          </p>
        </div>

        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(200,168,72,0.3), transparent)', marginBottom: '3rem' }} aria-hidden="true" />

        <MembersGrid members={all} volunteers={volunteers} />

      </main>
    </div>
  )
}

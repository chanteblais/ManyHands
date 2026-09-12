import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getApprovedMember, getActiveVolunteer } from '@/lib/members'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'
import { getRoleSignupData, getShiftSignupData, getSelfJoinGroups } from '@/lib/participate-data'
import { getMemberResourceView } from '@/lib/resources'
import { SignupSection, type SignupInitialData } from '@/app/profile/SignupSection'
import { GroupCommitments } from '@/app/profile/GroupCommitments'
import { ResourceCommitments } from '@/app/profile/ResourceCommitments'
import { Header } from '@/components/Header'

export const dynamic = 'force-dynamic'

export default async function SignupPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const community = await getCommunity()

  // Everything the page's sections need, in one parallel round-trip — the
  // same assembly the /api/signup, /api/shift-signups, /api/groups/membership
  // and /api/resources routes serve, so the sections render with their data
  // in place instead of fetching it after hydration.
  const [member, roleData, shiftData, selfJoinGroups, resourceView, adminUserId] = await Promise.all([
    getApprovedMember(community.id, userId),
    getRoleSignupData(community.id, userId),
    getShiftSignupData(community.id, userId),
    getSelfJoinGroups(community.id, userId),
    getMemberResourceView(community.id, userId),
    requireAdmin(),
  ])
  // Not a member — an active volunteer still participates, shifts-only:
  // volunteers exist to take shifts. No roles, groups, resources, or hour
  // requirements (those are member concepts); every shift they take is a gift.
  if (!member) {
    const volunteer = await getActiveVolunteer(community.id, userId)
    if (!volunteer) redirect('/profile')

    const volunteerInitialData = {
      role: { signup: null, departments: [], shiftSignupOpen: shiftData.shiftSignupOpen },
      shifts: { ...shiftData, owed: [] },
    } as unknown as SignupInitialData

    return (
      <>
        <Header />
        <main style={{ maxWidth: '860px', margin: '0 auto', padding: '6rem 1.5rem 6rem' }}>
          <a
            href="/profile"
            style={{ fontSize: '0.75rem', color: 'var(--gold)', opacity: 0.6, textDecoration: 'none', letterSpacing: '0.08em', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '2rem' }}
          >
            ← Back to profile
          </a>

          <div style={{ marginBottom: '2rem' }}>
            {/* Not "Your Shifts" — the shift plaque right below carries that
                kicker already, and on this shifts-only page the echo was bare
                (UX 2026-07-20 #30). Hands-language instead. */}
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', color: 'var(--gold)', margin: '0 0 0.5rem', letterSpacing: '0.06em' }}>
              Lend a Hand
            </h1>
            <p style={{ fontSize: '0.9rem', opacity: 0.55, margin: 0, lineHeight: 1.6 }}>
              Lend your hands where they're needed — pick the shifts that work for you. You can change your mind anytime.
            </p>
          </div>

          <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.25), transparent)', marginBottom: '2rem' }} />

          <SignupSection initialData={volunteerInitialData} hideRole />
        </main>
      </>
    )
  }

  // Shared Resources is member-owned: approved (non-suspended) members author
  // lists and items; deleting a whole list is the one admin-gated action.
  const canManageResources = !member.suspended_at
  const canDeleteResourceLists = !!adminUserId

  // The lib types the payloads loosely (they're built for JSON serialization);
  // the shapes are exactly what the client components' own types describe.
  const signupInitialData = { role: roleData, shifts: shiftData } as unknown as SignupInitialData

  return (
    <>
      <Header />
      {/* 6rem top clears the fixed 64px nav (the /members convention) — at
          2rem the back link rendered underneath the translucent bar */}
      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '6rem 1.5rem 6rem' }}>

        {/* Back link */}
        <a
          href="/profile"
          style={{ fontSize: '0.75rem', color: 'var(--gold)', opacity: 0.6, textDecoration: 'none', letterSpacing: '0.08em', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '2rem' }}
        >
          ← Back to profile
        </a>

        {/* Heading */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', color: 'var(--gold)', margin: '0 0 0.5rem', letterSpacing: '0.06em' }}>
            Your Role & Shift
          </h1>
          <p style={{ fontSize: '0.9rem', opacity: 0.55, margin: 0, lineHeight: 1.6 }}>
            Choose how you'll contribute to Glåüm. Pick a role that resonates and a shift that works for you.
          </p>
        </div>

        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.25), transparent)', marginBottom: '2rem' }} />

        <SignupSection initialData={signupInitialData} />

        {/* Shared resources — claim the gear you'll bring. Above groups: needs
            are live and time-sensitive; group membership is a set-once choice. */}
        <div id="bring" style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.25), transparent)', margin: '3rem 0 2rem' }} />

        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: 'var(--gold)', margin: '0 0 0.5rem', letterSpacing: '0.06em' }}>
            Bring Something
          </h2>
          <p style={{ fontSize: '0.9rem', opacity: 0.55, margin: 0, lineHeight: 1.6 }}>
            The camp runs on what we carry in together. Claim the gear you can bring, add what's missing, or start a new list — you can change your mind anytime.
          </p>
        </div>

        <ResourceCommitments
          initialLists={resourceView.lists}
          initialPulse={resourceView.pulse}
          canManage={canManageResources}
          canDeleteLists={canDeleteResourceLists}
        />

        {/* Self-join groups, grouped by collection (Contributions, Skills, …) */}
        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.25), transparent)', margin: '3rem 0 2rem' }} />

        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: 'var(--gold)', margin: '0 0 0.5rem', letterSpacing: '0.06em' }}>
            Your Groups
          </h2>
          <p style={{ fontSize: '0.9rem', opacity: 0.55, margin: 0, lineHeight: 1.6 }}>
            Opt into the groups you'd like to be part of. You can update your choices anytime.
          </p>
        </div>

        <GroupCommitments initialGroups={selfJoinGroups} />

      </main>
    </>
  )
}

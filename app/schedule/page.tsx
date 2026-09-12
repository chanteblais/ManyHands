import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ScheduleSection } from '@/components/ScheduleSection'
import { LeadUpGatherings } from './LeadUpGatherings'
import { Header } from '@/components/Header'
import { getMemberLeadUpEvents } from '@/lib/lead-up'
import { getApprovedMember } from '@/lib/members'
import { getCommunity } from '@/lib/community'

export default async function SchedulePage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const community = await getCommunity()

  // Gate + gatherings in one batch; the events are discarded on redirect. A
  // failed gatherings fetch degrades to undefined — the section then runs its
  // own mount fetch instead of erroring the page.
  const [member, leadUpEvents] = await Promise.all([
    // Only approved members can view schedule — canonical gate (members table
    // + email fallback; see app/messages/page.tsx).
    getApprovedMember(community.id, userId),
    getMemberLeadUpEvents(community.id, userId).catch(() => undefined),
  ])

  if (!member) redirect('/profile')

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      <Header />
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '4.5rem 1.5rem 6rem', position: 'relative', zIndex: 1 }}>

        <div style={{ marginBottom: '2rem' }}>
          <a href="/" style={{ fontSize: '0.78rem', letterSpacing: '0.12em', color: 'var(--gold)', textDecoration: 'none', opacity: 0.55 }}>
            ← Back to camp
          </a>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 6vw, 3.5rem)',
          color: 'var(--gold)',
          textAlign: 'center',
          marginBottom: '0.5rem',
          textShadow: '0 2px 8px rgba(0,0,0,0.8)',
        }}>
          Schedule
        </h1>

        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgb(var(--gold-rgb) / 0.4), transparent)', margin: '2rem 0 3rem' }} />

        <LeadUpGatherings initialEvents={leadUpEvents} />

        <ScheduleSection />

      </div>
    </div>
  )
}

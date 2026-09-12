import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getApprovedMember } from '@/lib/members'
import { getCommunity } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'
import { getRadioFeed, getRadioNowData, getRadioStats } from '@/lib/radio'
import { Header } from '@/components/Header'
import { RadioHero } from './RadioHero'
import { RadioNowStrip } from './RadioNowStrip'
import { RadioComposer, GoLiveBar } from './RadioComposer'
import { RadioFeed, type RadioMember } from './RadioFeed'

export const dynamic = 'force-dynamic'

// Radio — the curated community feed (docs/radio.md). A stream of moments,
// not chat and not an audit log: members tune in to what's happening around
// camp. Members-only; writing is broadcasters-only.

const statIcon: Record<string, React.ReactNode> = {
  waves: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C8A848" strokeWidth="0.9" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="1.6" fill="#C8A848" stroke="none" />
      <path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M5.7 18.3a9 9 0 0 1 0-12.6M18.3 5.7a9 9 0 0 1 0 12.6" opacity="0.6" />
    </svg>
  ),
  tent: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C8A848" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 4 3 19h18L12 4Z" />
      <path d="M12 12l-3.4 7h6.8L12 12Z" />
    </svg>
  ),
  medal: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C8A848" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="7.6" />
      <path d="M12 7.7l1.1 3.2 3.2 1.1-3.2 1.1-1.1 3.2-1.1-3.2-3.2-1.1 3.2-1.1L12 7.7Z" />
    </svg>
  ),
  horn: (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C8A848" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 10v4h3l7 5V5l-7 5H4Z" />
      <path d="M17.5 9.5a4 4 0 0 1 0 5" />
    </svg>
  ),
}

export default async function RadioPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const member = await getApprovedMember(community.id, userId)
  if (!member) redirect('/profile')

  const [events, nowData, stats, rosterRes] = await Promise.all([
    getRadioFeed(community.id, 60),
    getRadioNowData(community.id),
    getRadioStats(community.id),
    // The roster for @mention autocomplete + turning "@Name" into profile-linked
    // pills. Approved members with a Clerk id and a display name.
    db
      .from('members')
      .select('clerk_user_id, first_name, preferred_name')
      .eq('status', 'approved'),
  ])

  const members: RadioMember[] = (rosterRes.data ?? [])
    .map(m => ({ userId: m.clerk_user_id as string, displayName: (m.preferred_name || m.first_name || '') as string }))
    .filter(m => m.userId && m.displayName)

  const statCells: { icon: keyof typeof statIcon; value: number; label: string }[] = [
    { icon: 'waves', value: stats.postsThisWeek, label: 'broadcasts this week' },
    { icon: 'tent', value: stats.contributions, label: 'resources claimed' },
    { icon: 'medal', value: stats.achievements, label: 'distinctions awarded' },
    { icon: 'horn', value: stats.broadcasts, label: 'announcements shared' },
  ]

  return (
    <>
      <Header />
      {/* Child combinators in inline <style> need dangerouslySetInnerHTML —
          the server escapes `>` to `&gt;` and hydration trips (house gotcha). */}
      <style dangerouslySetInnerHTML={{ __html: `
        .radio-main { max-width: 760px; margin: 0 auto; padding: 5.5rem 1.5rem 6rem; }
        .radio-stats { display: grid; grid-template-columns: repeat(4, 1fr); }
        /* flex-start keeps every NUMBER on the same line regardless of how
           many lines its label wraps to */
        .radio-stat { display: flex; align-items: flex-start; gap: 0.75rem; justify-content: center; padding: 0 0.75rem; min-width: 0; }
        .radio-stat-icon { margin-top: 2px; }
        .radio-stat + .radio-stat { border-left: 1px solid rgba(200,168,72,0.14); }
        .radio-stat-icon { opacity: 0.8; flex-shrink: 0; display: flex; }
        .radio-stat-num { display: block; font-size: 1.25rem; color: #C8A848; line-height: 1.1; }
        .radio-stat-label { display: block; font-size: 0.68rem; color: #F3EDE6; opacity: 0.5; line-height: 1.35; }
        /* one row on mobile too — everything just gets smaller */
        @media (max-width: 640px) {
          .radio-stat { gap: 0.35rem; padding: 0 0.25rem; }
          .radio-stat-icon svg { width: 15px; height: 15px; }
          /* the 0.9 desktop stroke renders sub-pixel at 15px — restore the
             same optical weight (CSS beats the strokeWidth attribute) */
          .radio-stat-icon svg path, .radio-stat-icon svg circle { stroke-width: 1.55; }
          .radio-stat-num { font-size: 0.9rem; }
          .radio-stat-label { font-size: 0.5rem; }
          /* the whole page tightens: narrower gutters, smaller gaps between
             bands. !important beats the components' inline (desktop) values;
             bottom padding stays 6rem for the fixed tab bar. */
          .radio-main { padding: 4.75rem 1rem 6rem; }
          .radio-stats { padding: 0.5rem 0.25rem !important; margin-bottom: 1.2rem !important; }
          .radio-composer { margin-bottom: 1.4rem !important; }
          .radio-composer-box { gap: 0.5rem !important; padding: 0.5rem 0.5rem 0.5rem 0.85rem !important; }
          .radio-composer-btn { padding: 0.5rem 0.85rem !important; }
          .radio-now { padding: 0.8rem 1rem !important; margin-bottom: 1.4rem !important; }
          .radio-now-welcome { font-size: 0.95rem !important; }
          .radio-golive { padding: 0.8rem 1rem !important; margin-top: 1.5rem !important; gap: 0.75rem !important; }
          .radio-golive-desc { display: none; }
        }
      ` }} />
      <main className="radio-main">

        {/* ── Hero (RadioHero: waves mark, diamond rule, script subtitle,
               frequency waveform — her banner mockup) ── */}
        <RadioHero />

        {/* ── Stats band ── */}
        <div
          className="radio-stats"
          style={{
            border: '1px solid rgba(200,168,72,0.16)',
            borderRadius: '0.9rem',
            background: 'rgba(243,237,230,0.03)',
            padding: '0.65rem 0.4rem',
            marginBottom: '1.75rem',
          }}
        >
          {statCells.map(cell => (
            <div key={cell.label} className="radio-stat">
              <span aria-hidden className="radio-stat-icon">{statIcon[cell.icon]}</span>
              <span style={{ minWidth: 0 }}>
                <span className="radio-stat-num">{cell.value}</span>
                <span className="radio-stat-label">{cell.label}</span>
              </span>
            </div>
          ))}
        </div>

        <RadioComposer members={members} currentUserId={userId} />

        <RadioNowStrip welcome={nowData.welcome} todayEvents={nowData.todayEvents} />

        <RadioFeed events={events} members={members} currentUserId={userId} />

        <GoLiveBar />

      </main>
    </>
  )
}

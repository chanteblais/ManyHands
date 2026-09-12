import { auth } from '@clerk/nextjs/server'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { CommunityFinder } from '@/components/CommunityFinder'
import { getCommunity, listCommunitiesForUser, isPlatformCommunity } from '@/lib/community'
import { listDiscoverableCommunities } from '@/lib/community-directory'
import { appOrigin } from '@/lib/send-email'

export const dynamic = 'force-dynamic'

// The community picker + public directory (docs/tenancy-design.md §6,
// docs/features.md → Communities picker). Signed in: every community the
// person belongs to, then "Find a community". Signed out: the directory with a
// sign-in prompt. This is the whole platform host today (proxy.ts rewrites
// `/` here on PLATFORM_HOSTS); it is also reachable by path on any community.
export default async function CommunitiesPage() {
  const { userId } = await auth()
  const [current, memberships, directory] = await Promise.all([
    getCommunity(),
    userId ? listCommunitiesForUser(userId) : Promise.resolve([]),
    listDiscoverableCommunities(),
  ])
  const visible = memberships.filter(m => m.status !== 'cancelled' && m.status !== 'removed' && m.status !== 'rejected')
  const onPlatform = isPlatformCommunity(current)
  const card = { marginTop: '2rem', padding: '1.5rem', border: '1px solid rgb(var(--gold-rgb) / 0.25)', borderRadius: '12px', lineHeight: 1.7 } as const

  return (
    <>
      <Header />
      <main style={{ paddingTop: '64px', minHeight: '70vh' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '4rem 1.5rem 3rem' }}>
          <p style={{ fontSize: '0.68rem', letterSpacing: '0.32em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: '1rem', opacity: 0.85 }}>
            Many Hands
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 6vw, 3.5rem)', color: 'var(--gold)', margin: '0 0 0.75rem', lineHeight: 1 }}>
            {userId ? 'Your communities' : 'Communities'}
          </h1>

          {!userId ? (
            <div style={card}>
              <p style={{ margin: '0 0 0.75rem' }}>Already part of a community here?</p>
              <Link href="/sign-in" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Sign in</Link>
              <span style={{ opacity: 0.7 }}> to see your communities.</span>
            </div>
          ) : visible.length === 0 ? (
            <div style={card}>
              <p style={{ margin: '0 0 0.75rem' }}>You&rsquo;re signed in, but you&rsquo;re not part of a community here yet.</p>
              <p style={{ margin: 0, opacity: 0.75 }}>
                Find one below that is accepting applications, or ask your organizer for their community&rsquo;s page.
              </p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: '2rem 0 0', display: 'grid', gap: '0.75rem' }}>
              {visible.map(({ community, status, role }) => {
                const isCurrent = !onPlatform && community.id === current.id
                return (
                  <li key={community.id}>
                    <a
                      href={isCurrent ? '/' : `${appOrigin(community)}/`}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem',
                        padding: '1rem 1.25rem', borderRadius: '12px', textDecoration: 'none',
                        border: `1px solid ${isCurrent ? 'rgb(var(--purple-rgb) / 0.45)' : 'rgb(var(--gold-rgb) / 0.25)'}`,
                        background: isCurrent ? 'rgb(var(--purple-rgb) / 0.05)' : 'rgba(255,255,255,0.02)',
                        color: 'var(--cream)',
                      }}
                    >
                      <span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--gold)' }}>{community.name}</span>
                        {community.eventName && (
                          <span style={{ display: 'block', fontSize: '0.8rem', opacity: 0.65, marginTop: '0.2rem' }}>{community.eventName}</span>
                        )}
                      </span>
                      <span style={{ fontSize: '0.68rem', letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.7, whiteSpace: 'nowrap' }}>
                        {role === 'admin' ? 'Admin' : status === 'approved' ? 'Member' : status}
                        {isCurrent ? ' · here' : ''}
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          )}

          <CommunityFinder communities={directory.filter(d => !visible.some(m => m.community.slug === d.slug))} />
        </div>
      </main>
      <Footer />
    </>
  )
}

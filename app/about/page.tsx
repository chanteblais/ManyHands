import { auth } from '@clerk/nextjs/server'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Section, Kicker } from '@/components/Section'
import { getAllPageContent } from '@/lib/page-content'
import { resolveMemberForUser } from '@/lib/members'
import { getCommunity } from '@/lib/community'

export const dynamic = 'force-dynamic'

export default async function AboutPage() {
  const { userId } = await auth()
  const community = await getCommunity()

  // Member lookup and page content are independent — one round-trip.
  const [member, pageContent] = await Promise.all([
    userId ? resolveMemberForUser(community.id, userId) : Promise.resolve(null),
    getAllPageContent(community.id),
  ])
  const hasApplied = !!member && member.status !== 'cancelled'
  const c = (key: string, fallback: string) => pageContent[key] ?? fallback

  return (
    <>
      <Header />

      <main style={{ paddingTop: '64px' }}>

        {/* ─── HERO ─────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', padding: '4rem 1.5rem 3rem', position: 'relative', zIndex: 1 }}>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '700px', height: '400px',
              borderRadius: '50%',
              // The gradient is the glow — no filter: blur() needed (big
              // offscreen paint on phones).
              background: 'radial-gradient(ellipse, rgba(210,57,248,0.1) 0%, transparent 72%)',
              pointerEvents: 'none',
            }}
          />
          <p style={{ fontSize: '0.68rem', letterSpacing: '0.32em', textTransform: 'uppercase', color: '#D239F8', marginBottom: '1rem', opacity: 0.85 }}>
            {community.eventName} · Theme Camp
          </p>
          <h1 style={{ fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(2.5rem, 8vw, 5rem)', color: '#C8A848', margin: '0 0 0.75rem', lineHeight: 1, textShadow: '0 0 40px rgba(210,57,248,0.4), 0 4px 20px rgba(0,0,0,0.8)' }}>
            About {community.name}
          </h1>
          <p style={{ fontSize: 'clamp(0.9rem, 2vw, 1.05rem)', fontStyle: 'italic', opacity: 0.6, maxWidth: '440px', margin: '0 auto', lineHeight: 1.75, fontFamily: 'var(--font-libre-baskerville)' }}>
            {c('home_tagline', 'Built by many hands. Held by many hearts.')}
          </p>
        </div>

        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(210,57,248,0.3), transparent)' }} />

        {/* ─── ABOUT ────────────────────────────────────────── */}
        <Section id="about">
          <Kicker>What is this, exactly</Kicker>
          <h2 style={{ fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(2rem, 5vw, 3rem)', marginBottom: '2rem', lineHeight: 1.15, textAlign: 'center' }}>
            {c('home_about_heading', 'A camp. A collective.')}
          </h2>
          <div style={{ border: '1px solid rgba(200,168,72,0.15)', borderRadius: '1.25rem', background: 'rgba(10,0,20,0.45)', padding: '2rem 2.5rem' }}>
            {c('home_about_body', '').split('\n\n').filter(Boolean).map((para, i) => (
              <p key={i} style={{ fontSize: '1.05rem', lineHeight: 1.85, marginBottom: '1.25rem', fontStyle: i === 3 ? 'italic' : undefined, opacity: i === 3 ? 0.65 : 0.85, fontFamily: 'var(--font-libre-baskerville)' }}>
                {para}
              </p>
            ))}
          </div>
        </Section>

        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(200,168,72,0.15), transparent)' }} />

        {/* ─── PRINCIPLES ───────────────────────────────────── */}
        <Section id="principles">
          <Kicker>How we show up</Kicker>
          <h2 style={{ fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(2rem, 5vw, 3rem)', marginBottom: '2.5rem', lineHeight: 1.15, textAlign: 'center' }}>
            Our Principles
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {[
              { title: 'Dignity', body: 'Every person deserves to be treated with dignity and respect.' },
              { title: 'Participation', body: 'Communities thrive when people contribute within their capacity.' },
              { title: 'Stewardship', body: 'No one person should be responsible for carrying the whole community.' },
              { title: 'Communication', body: 'We strive to communicate honestly, directly, and in good faith.' },
            ].map(({ title, body }) => (
              <div key={title} style={{ border: '1px solid rgba(200,168,72,0.18)', borderRadius: '1.25rem', background: 'rgba(10,0,20,0.45)', padding: '1.75rem 2rem' }}>
                <p style={{ fontFamily: 'TokyoDreams, serif', fontSize: '1.1rem', color: '#C8A848', margin: '0 0 0.75rem', letterSpacing: '0.04em' }}>
                  {title}
                </p>
                <div style={{ height: '1px', background: 'linear-gradient(90deg, rgba(200,168,72,0.3), transparent)', marginBottom: '0.9rem' }} />
                <p style={{ fontSize: '0.97rem', lineHeight: 1.8, opacity: 0.75, margin: 0, fontFamily: 'var(--font-libre-baskerville)' }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(200,168,72,0.15), transparent)' }} />

        {/* ─── PARTICIPATE ──────────────────────────────────── */}
        <Section id="participate">
          <Kicker>How to be in it</Kicker>
          <h2 style={{ fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(2rem, 5vw, 3rem)', marginBottom: '2rem', textAlign: 'center' }}>
            {c('home_participate_heading', 'This Camp Runs on Participation')}
          </h2>
          <div style={{ border: '1px solid rgba(200,168,72,0.15)', borderRadius: '1.25rem', background: 'rgba(10,0,20,0.45)', padding: '2rem 2.5rem', marginBottom: '2.5rem' }}>
            <p style={{ fontSize: '1.05rem', lineHeight: 1.85, margin: 0, opacity: 0.85, fontFamily: 'var(--font-libre-baskerville)' }}>
              {c('home_participate_body', 'The Many Hands hold us all up. Sometimes we do the carrying. Sometimes we are carried. Everyone contributes in some way: setup, teardown, cooking, welcoming, cleaning, decorating, emotional support, infrastructure, care.')}
            </p>
          </div>
          {!hasApplied && (
            <div style={{ textAlign: 'center' }}>
              <a
                href="/apply"
                style={{
                  display: 'inline-block',
                  padding: '0.9rem 2.75rem',
                  borderRadius: '9999px',
                  border: '1px solid rgba(200,168,72,0.55)',
                  background: 'rgba(200,168,72,0.1)',
                  color: '#FFFACD',
                  textDecoration: 'none',
                  letterSpacing: '0.14em',
                  fontSize: '0.82rem',
                  fontFamily: 'TokyoDreams, serif',
                }}
              >
                Apply to Camp
              </a>
            </div>
          )}
        </Section>

      </main>

      <Footer />
    </>
  )
}

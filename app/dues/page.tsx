import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getPageContentValue } from '@/lib/page-content'
import { getApprovedMember } from '@/lib/members'
import { parseDuesConfig, formatDuesAmount, duesConfigReady, duesAppliesToMembers } from '@/lib/dues'
import { RichText } from '@/lib/markdown-lite'
import { Header } from '@/components/Header'
import { DuesReportButton } from './DuesReportButton'

const GOLD = 'var(--gold)'
const CREAM = 'var(--cream)'

export const dynamic = 'force-dynamic'

// Member-facing camp-dues page. Shows how to pay (configured in Admin →
// Community → Camp Dues) and the member's own recorded status. This year dues
// are collected by email, so payment happens outside the app — this page just
// explains the how and reflects what an admin has recorded.
export default async function DuesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const [member, duesValue] = await Promise.all([
    getApprovedMember(community.id, userId),
    getPageContentValue(community.id, 'config_dues'),
  ])
  if (!member) redirect('/profile')

  const cfg = parseDuesConfig(duesValue)

  // Dues off, or not applied to members → nothing to collect here.
  if (!duesAppliesToMembers(cfg)) {
    return (
      <>
        <Header />
        <main style={{ maxWidth: '640px', margin: '0 auto', padding: '6rem 1.5rem 6rem' }}>
          <a href="/profile" style={{ fontSize: '0.75rem', color: GOLD, opacity: 0.6, textDecoration: 'none', letterSpacing: '0.08em', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '2rem' }}>
            ← Back to profile
          </a>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', color: GOLD, margin: '0 0 0.75rem', letterSpacing: '0.06em' }}>
            Camp Dues
          </h1>
          <p style={{ fontSize: '0.9rem', opacity: 0.6, lineHeight: 1.7 }}>
            Camp dues aren’t being collected right now. If you think that’s a mistake, reach out to an organizer.
          </p>
        </main>
      </>
    )
  }

  const amount = formatDuesAmount(cfg)
  const paid = !!member.dues_paid_at
  // Self-reported but not yet admin-confirmed → "awaiting confirmation" (068).
  const reported = !paid && !!member.dues_reported_at
  const owed = !paid && !reported
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  const paidDate = paid ? fmtDate(member.dues_paid_at as string) : null
  const reportedDate = reported ? fmtDate(member.dues_reported_at as string) : null

  return (
    <>
      <Header />
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '6rem 1.5rem 6rem' }}>
        <a
          href="/profile"
          style={{ fontSize: '0.75rem', color: GOLD, opacity: 0.6, textDecoration: 'none', letterSpacing: '0.08em', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginBottom: '2rem' }}
        >
          ← Back to profile
        </a>

        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', color: GOLD, margin: '0 0 0.5rem', letterSpacing: '0.06em' }}>
            Camp Dues
          </h1>
          <p style={{ fontSize: '0.9rem', opacity: 0.55, margin: 0, lineHeight: 1.6 }}>
            Dues keep the fire lit — they cover what we share as a camp.
          </p>
        </div>

        {/* Status card — paid / awaiting confirmation / owed */}
        <div
          style={{
            border: `1px solid ${paid || reported ? 'rgb(var(--gold-rgb) / 0.35)' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: '1rem',
            background: paid || reported ? 'rgb(var(--gold-rgb) / 0.06)' : 'rgba(255,255,255,0.02)',
            padding: '1.25rem 1.5rem',
            marginBottom: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.9rem',
          }}
        >
          <span style={{ fontSize: '1.5rem', lineHeight: 1 }} aria-hidden>{paid ? '✓' : reported ? '⧗' : '◷'}</span>
          <div>
            <p style={{ margin: 0, fontSize: '0.95rem', color: paid || reported ? GOLD : CREAM }}>
              {paid
                ? 'Your dues are recorded — thank you.'
                : reported
                  ? 'Thanks — we’re confirming your payment.'
                  : 'Your dues haven’t been recorded yet.'}
            </p>
            {paid && paidDate && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', opacity: 0.5 }}>Received {paidDate}</p>
            )}
            {reported && reportedDate && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', opacity: 0.5 }}>
                You reported paying on {reportedDate} — an organizer will confirm it shortly.
              </p>
            )}
            {owed && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', opacity: 0.5 }}>
                Paid already? Let us know below — we’ll confirm it here.
              </p>
            )}
          </div>
        </div>

        {/* Awaiting confirmation — a quiet Undo sits under the status card */}
        {reported && (
          <div style={{ marginBottom: '2rem' }}>
            <DuesReportButton reported />
          </div>
        )}

        {/* How to pay — a bordered card so the amount + instructions read as
            the main event, not sub-text; the self-report button lives inside it. */}
        {owed && (
          <div
            style={{
              border: '1px solid rgb(var(--gold-rgb) / 0.35)',
              borderRadius: '1rem',
              background: 'rgb(var(--gold-rgb) / 0.035)',
              padding: '1.5rem 1.5rem 1.6rem',
            }}
          >
            <h2 style={{ fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: GOLD, opacity: 0.85, margin: '0 0 1.25rem' }}>
              How to pay
            </h2>

            {duesConfigReady(cfg) ? (
              <>
                {amount && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <p style={{ margin: 0, fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.45 }}>
                      {cfg.mode === 'sliding' ? 'Sliding scale' : 'Amount'}
                    </p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '1.6rem', color: GOLD, fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>
                      {amount}
                    </p>
                    {cfg.mode === 'sliding' && (
                      <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', opacity: 0.6, fontStyle: 'italic' }}>
                        Pay what you’re able within this range — no questions asked.
                      </p>
                    )}
                  </div>
                )}

                {cfg.paymentEmail && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <p style={{ margin: 0, fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.45 }}>
                      Send to
                    </p>
                    <a
                      href={`mailto:${cfg.paymentEmail}`}
                      style={{ display: 'inline-block', margin: '0.25rem 0 0', fontSize: '1rem', color: GOLD, textDecoration: 'none', borderBottom: '1px solid rgb(var(--gold-rgb) / 0.4)', paddingBottom: '1px' }}
                    >
                      {cfg.paymentEmail}
                    </a>
                  </div>
                )}

                {cfg.instructions.trim() && (
                  <RichText
                    text={cfg.instructions}
                    baseStyle={{ fontSize: '0.9rem', lineHeight: 1.75, opacity: 0.8 }}
                  />
                )}
              </>
            ) : (
              <p style={{ fontSize: '0.85rem', opacity: 0.6, lineHeight: 1.7, fontStyle: 'italic', margin: 0 }}>
                Payment details are being finalized — check back soon, or reach out to an organizer.
              </p>
            )}

            {/* Divider + self-report button, inside the card */}
            <div style={{ height: '1px', background: 'rgb(var(--gold-rgb) / 0.18)', margin: '1.5rem 0 1.25rem' }} />
            <DuesReportButton reported={false} />
          </div>
        )}
      </main>
    </>
  )
}

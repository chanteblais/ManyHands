import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { collectOutstandingAttunement } from '@/lib/attunement-nudge'
import { sendAttunementNudgeEmail } from '@/lib/send-email'
import { parseAttunementNudgeDays } from '@/lib/site-config'
import { daysUntilEvent } from '@/lib/camp-event'

export const dynamic = 'force-dynamic'
// A full sweep is N members × a few queries + one email each (throttled below);
// give the function room beyond the default 10s.
export const maxDuration = 60

// Per-member cadence comes from `config_attunement_nudge_days` (set in the
// Attunement Tasks manager; 0 = off). The cron still fires daily — each member
// is only emailed once their cooldown has lapsed. 4h of slack keeps drift in
// Vercel's fire time from silently pushing everyone a day late.
const cooldownHours = (nudgeDays: number) => nudgeDays * 24 - 4
// Resend allows 2 requests/second — space sends out rather than burst.
const SEND_SPACING_MS = 600

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Two callers may run the sweep:
//   'cron'  — Vercel Cron with `Authorization: Bearer ${CRON_SECRET}` (sends by default)
//   'admin' — a logged-in admin hitting the URL in a browser (dry-runs by default,
//             add ?send=1 to actually send). Dry-run reports who would get what
//             without emailing or touching the ledger.
async function authorize(req: NextRequest): Promise<'cron' | 'admin' | null> {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return 'cron'
  const { userId } = await auth()
  if (!userId) return null
  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  return user.publicMetadata?.role === 'admin' ? 'admin' : null
}

export async function GET(req: NextRequest) {
  const caller = await authorize(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Resolved once from the host (the per-community loop is a later branch).
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const params = req.nextUrl.searchParams
  const dryRun = caller === 'admin' ? params.get('send') !== '1' : params.get('dryRun') === '1'

  const outstanding = await collectOutstandingAttunement(community.id)

  // Opt-outs + ledger in two batch queries.
  const clerkIds = outstanding.map(m => m.clerkUserId)
  const optedOut = new Set<string>()
  const ledger = new Map<string, { last_sent_at: string; outstanding_count: number; nudge_count: number }>()
  if (clerkIds.length) {
    const [{ data: prefRows, error: prefError }, { data: ledgerRows }] = await Promise.all([
      db
        .from('notification_preferences')
        .select('clerk_user_id, email_attunement_nudges')
        .in('clerk_user_id', clerkIds),
      db
        .from('attunement_nudges')
        .select('clerk_user_id, last_sent_at, outstanding_count, nudge_count')
        .in('clerk_user_id', clerkIds),
    ])
    // Fail CLOSED on a broken opt-out read: without it we can't tell who opted
    // out, and "email everyone anyway" is the wrong default.
    if (prefError) {
      console.error('[attunement-nudges] preference lookup failed, aborting sweep:', prefError)
      return NextResponse.json({ error: `preference lookup failed: ${prefError.message}` }, { status: 500 })
    }
    for (const p of prefRows ?? []) if (p.email_attunement_nudges === false) optedOut.add(p.clerk_user_id)
    for (const l of ledgerRows ?? []) ledger.set(l.clerk_user_id, l)
  }

  const { data: cfgRows } = await db
    .from('page_content')
    .select('key, value')
    .in('key', ['config_event_start_date', 'config_attunement_nudge_days'])
  const cfg = Object.fromEntries((cfgRows ?? []).map(r => [r.key, r.value]))
  const daysUntil = daysUntilEvent(cfg['config_event_start_date'])
  const nudgeDays = parseAttunementNudgeDays(cfg['config_attunement_nudge_days'])
  const cooldownFloor = Date.now() - cooldownHours(nudgeDays) * 60 * 60 * 1000

  const report: { name: string; email: string | null; required: string[]; commitments: string[]; status: string }[] = []
  let sent = 0
  for (const m of outstanding) {
    const entry = {
      name: m.name,
      email: m.email,
      required: m.outstandingRequired.map(t => t.label),
      commitments: m.outstandingCommitments.map(t => t.label),
      status: 'due',
    }
    report.push(entry)

    if (nudgeDays === 0) { entry.status = 'skipped: reminders off'; continue }
    if (!m.email) { entry.status = 'skipped: no email'; continue }
    if (optedOut.has(m.clerkUserId)) { entry.status = 'skipped: opted out'; continue }
    const prev = ledger.get(m.clerkUserId)
    if (prev && new Date(prev.last_sent_at).getTime() > cooldownFloor) { entry.status = 'skipped: nudged recently'; continue }
    if (dryRun) { entry.status = 'would send'; continue }

    // Claim the ledger BEFORE sending (mirrors event-reminders): bump
    // last_sent_at conditionally so exactly one concurrent sweep wins the
    // claim; the loser sees zero rows updated / a conflict and skips.
    const outstandingCount = m.outstandingRequired.length + m.outstandingCommitments.length
    let claimed: boolean
    if (prev) {
      const { data: rows, error } = await db
        .from('attunement_nudges')
        .update({ last_sent_at: new Date().toISOString(), outstanding_count: outstandingCount, nudge_count: prev.nudge_count + 1 })
        .eq('clerk_user_id', m.clerkUserId)
        .eq('last_sent_at', prev.last_sent_at)
        .select('clerk_user_id')
      claimed = !error && (rows?.length ?? 0) > 0
    } else {
      const { data: rows, error } = await db
        .from('attunement_nudges')
        .upsert(
          { clerk_user_id: m.clerkUserId, last_sent_at: new Date().toISOString(), outstanding_count: outstandingCount, nudge_count: 1 },
          { onConflict: 'clerk_user_id', ignoreDuplicates: true } // unique on clerk_user_id alone until migration 075
        )
        .select('clerk_user_id')
      claimed = !error && (rows?.length ?? 0) > 0
    }
    if (!claimed) { entry.status = 'skipped: claimed by a concurrent sweep'; continue }

    // Send failed → restore the previous ledger state so the next sweep
    // retries instead of waiting out a cooldown that never emailed (best-effort).
    const releaseClaim = () => prev
      ? db.from('attunement_nudges').update(prev).eq('clerk_user_id', m.clerkUserId)
      : db.from('attunement_nudges').delete().eq('clerk_user_id', m.clerkUserId)

    try {
      const result = await sendAttunementNudgeEmail({
        community,
        to: m.email,
        recipientName: m.name,
        required: m.outstandingRequired.map(t => ({ label: t.label, href: t.href })),
        commitments: m.outstandingCommitments.map(t => ({ label: t.label, href: t.href })),
        eventName: community.eventName ?? community.name,
        daysUntil,
      })
      if (result.ok) {
        sent++
        entry.status = 'sent'
      } else {
        entry.status = `failed: ${result.error}`
        await releaseClaim()
      }
    } catch (err) {
      // Best-effort: one bad address must never stop the sweep.
      console.error('[attunement-nudges] send failed:', err)
      entry.status = 'failed'
      await releaseClaim()
    }
    await sleep(SEND_SPACING_MS)
  }

  return NextResponse.json({
    dryRun,
    caller,
    nudgeDays,
    daysUntil,
    membersWithOutstanding: outstanding.length,
    sent,
    report,
  })
}

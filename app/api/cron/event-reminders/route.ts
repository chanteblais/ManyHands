import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity, listCommunities, type Community } from '@/lib/community'
import {
  localDate, localHour, settingHour,
  DEFAULT_REMINDER_MORNING_HOUR_LOCAL, DEFAULT_REMINDER_EVENING_HOUR_LOCAL,
} from '@/lib/community-time'
import { collectEventReminders } from '@/lib/event-reminders'
import { sendEventReminderEmail } from '@/lib/send-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Gathering/shift reminders. One HOURLY Vercel Cron entry hits this route
// (vercel.json); for every active community it decides, from the community's
// local hour (communities.timezone + settings), which phase is due:
//   • morning_of  — at reminder_morning_hour_local (default 8): items TODAY
//   • day_before  — at reminder_evening_hour_local (default 19): items TOMORROW
// Reminders are batched (one email per member per phase per day) and deduped via
// the event_reminders_sent ledger, so a re-fire or overlap never double-sends.

const SEND_SPACING_MS = 600 // Resend allows ~2 req/s
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
type Phase = 'day_before' | 'morning_of'

// 'cron'  — Vercel Cron with Authorization: Bearer ${CRON_SECRET} (sends; all
//           communities, phase chosen by local hour)
// 'admin' — an admin of the request's community hitting the URL (that
//           community only; dry-runs unless ?send=1; ?phase= picks the phase,
//           default both; ?date=YYYY-MM-DD previews a specific date)
async function authorize(req: NextRequest): Promise<'cron' | 'admin' | null> {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return 'cron'
  return (await requireAdmin()) ? 'admin' : null
}

function duePhases(community: Community, now: Date): Phase[] {
  const hour = localHour(community.timezone, now)
  const phases: Phase[] = []
  if (hour === settingHour(community.settings, 'reminder_morning_hour_local', DEFAULT_REMINDER_MORNING_HOUR_LOCAL)) phases.push('morning_of')
  if (hour === settingHour(community.settings, 'reminder_evening_hour_local', DEFAULT_REMINDER_EVENING_HOUR_LOCAL)) phases.push('day_before')
  return phases
}

async function sweepCommunity(community: Community, phases: Phase[], dryRun: boolean, dateOverride: string | null, now: Date) {
  const db = tenantDb(community.id)
  const report: Record<string, unknown>[] = []
  let sent = 0

  for (const phase of phases) {
    const targetDate = dateOverride ?? localDate(community.timezone, phase === 'day_before' ? 1 : 0, now)
    const recipients = await collectEventReminders(community.id, targetDate)

    // Opt-outs + already-sent ledger for this (date, phase), in two batch queries.
    const ids = recipients.map(r => r.clerkUserId)
    const optedOut = new Set<string>()
    const alreadySent = new Set<string>()
    if (ids.length) {
      const [{ data: prefRows, error: prefError }, { data: ledgerRows }] = await Promise.all([
        db.from('notification_preferences')
          .select('clerk_user_id, email_event_reminders').in('clerk_user_id', ids),
        db.from('event_reminders_sent')
          .select('clerk_user_id').eq('target_date', targetDate).eq('phase', phase).in('clerk_user_id', ids),
      ])
      // Fail CLOSED on a broken opt-out read: without it we can't tell who
      // opted out, and "email everyone anyway" is the wrong default. (A ledger
      // read failure only risks a duplicate, which the unique claim below blocks.)
      if (prefError) {
        console.error(`[event-reminders] ${community.slug}: preference lookup failed, skipping phase:`, prefError)
        report.push({ phase, targetDate, status: `phase skipped: preference lookup failed (${prefError.message})` })
        continue
      }
      for (const p of prefRows ?? []) if (p.email_event_reminders === false) optedOut.add(p.clerk_user_id)
      for (const l of ledgerRows ?? []) alreadySent.add(l.clerk_user_id)
    }

    for (const r of recipients) {
      const entry: Record<string, unknown> = {
        phase, targetDate, name: r.name, email: r.email, items: r.items.map(i => `${i.kind}:${i.title}`), status: 'due',
      }
      report.push(entry)

      if (!r.email) { entry.status = 'skipped: no email'; continue }
      if (optedOut.has(r.clerkUserId)) { entry.status = 'skipped: opted out'; continue }
      if (alreadySent.has(r.clerkUserId)) { entry.status = 'skipped: already sent'; continue }
      if (dryRun) { entry.status = 'would send'; continue }

      // Claim the ledger slot BEFORE sending: the UNIQUE constraint makes
      // exactly one concurrent runner the sender. (Send-then-record could
      // double-email when two fires overlap; claim-then-send at worst drops a
      // reminder if the process dies mid-send — the release below covers the
      // known failure paths.)
      const { error: claimError } = await db.from('event_reminders_sent')
        .insert({ clerk_user_id: r.clerkUserId, target_date: targetDate, phase })
      if (claimError) {
        entry.status = claimError.code === '23505'
          ? 'skipped: already sent (claimed by a concurrent run)'
          : `failed to claim ledger: ${claimError.message}`
        continue
      }
      // Send failed → release the claim so the next fire can retry (best-effort).
      const releaseClaim = () => db.from('event_reminders_sent')
        .delete().eq('clerk_user_id', r.clerkUserId).eq('target_date', targetDate).eq('phase', phase)

      try {
        const result = await sendEventReminderEmail({
          community,
          to: r.email, recipientName: r.name, phase, items: r.items,
          schedulePath: r.kind === 'volunteer' ? '/participate' : '/schedule',
        })
        if (result.ok) {
          sent++
          entry.status = 'sent'
        } else {
          entry.status = `failed: ${result.error}`
          await releaseClaim()
        }
      } catch (err) {
        console.error(`[event-reminders] ${community.slug}: send failed:`, err)
        entry.status = 'failed'
        await releaseClaim()
      }
      await sleep(SEND_SPACING_MS)
    }
  }

  return { community: community.slug, phases, sent, recipients: report.length, report }
}

export async function GET(req: NextRequest) {
  const caller = await authorize(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const dryRun = caller === 'admin' ? params.get('send') !== '1' : params.get('dryRun') === '1'
  const now = new Date()
  // Testing aid (admin): ?date=YYYY-MM-DD overrides the computed today/tomorrow
  // so a dry-run can preview a date that actually has items. The ledger dedupes
  // any manual re-send by (member, date, phase).
  const dateOverride = caller === 'admin' ? params.get('date') : null

  const jobs: Array<{ community: Community; phases: Phase[] }> = []
  if (caller === 'admin') {
    const requested = params.get('phase') as Phase | null
    jobs.push({ community: await getCommunity(), phases: requested ? [requested] : ['morning_of', 'day_before'] })
  } else {
    const force = params.get('force') === '1'
    for (const community of (await listCommunities()).filter(c => c.status === 'active')) {
      const phases = force ? (['morning_of', 'day_before'] as Phase[]) : duePhases(community, now)
      if (phases.length) jobs.push({ community, phases })
    }
  }

  const results = []
  for (const job of jobs) {
    results.push(await sweepCommunity(job.community, job.phases, dryRun, dateOverride, now))
  }

  return NextResponse.json({
    dryRun,
    caller,
    at: now.toISOString(),
    communities: results.map(r => r.community),
    sent: results.reduce((n, r) => n + r.sent, 0),
    results,
  })
}

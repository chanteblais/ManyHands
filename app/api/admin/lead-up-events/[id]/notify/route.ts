import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { sendLeadUpGatheringEmail } from '@/lib/send-email'
import { clockLabel } from '@/lib/shift-hours'
import { requireAdmin } from '@/lib/admin-auth'
import { getCommunity } from '@/lib/community'

// "2026-07-08" + "19:00" → "Tue, Jul 8 · 7:00 PM" (clockLabel tolerates
// legacy display-string times).
function whenLabel(event_date: string | null, start_time: string | null): string | null {
  let datePart: string | null = null
  if (event_date) {
    const dt = new Date(event_date + 'T00:00:00')
    if (!isNaN(dt.getTime())) {
      datePart = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    }
  }
  return [datePart, clockLabel(start_time)].filter(Boolean).join(' · ') || null
}

// POST — alert all approved members about this lead-up gathering: an in-app
// bell notification for each member with an account, plus an email to those who
// haven't turned announcement emails off. Deliberate (button-triggered), so it
// can be re-sent; sets notified_at for the manager's "Notified" state.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actingUserId = await requireAdmin()
  if (!actingUserId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data: gathering } = await db
    .from('lead_up_events')
    .select('id, title, event_date, start_time, location, link, image_url, visible')
    .eq('id', params.id)
    .maybeSingle()

  if (!gathering) return NextResponse.json({ error: 'Gathering not found' }, { status: 404 })
  if (!gathering.visible) {
    return NextResponse.json({ error: 'Make the gathering visible before notifying members.' }, { status: 400 })
  }

  // All approved members — including the sending admin, so they see the
  // blast land exactly as members do.
  const { data: membersRaw } = await db
    .from('members')
    .select('clerk_user_id, email, first_name, preferred_name')
    .eq('status', 'approved')
  const recipients = membersRaw ?? []

  const when = whenLabel(gathering.event_date, gathering.start_time)
  const message = `New lead-up gathering: ${gathering.title}${when ? ` — ${when}` : ''}`

  // In-app bell notifications — batch insert for members with an account.
  const bellRows = recipients
    .filter(m => m.clerk_user_id)
    .map(m => ({
      clerk_user_id: m.clerk_user_id as string,
      event_type: 'lead_up_gathering',
      message,
      details: { leadUpEventId: gathering.id },
    }))
  if (bellRows.length) {
    await db.from('user_notifications').insert(bellRows)
  }

  // Announcement-email preferences in one query (default ON when no row).
  const clerkIds = recipients.map(m => m.clerk_user_id).filter(Boolean) as string[]
  const optedOut = new Set<string>()
  if (clerkIds.length) {
    const { data: prefRows } = await db
      .from('notification_preferences')
      .select('clerk_user_id, email_announcements')
      .in('clerk_user_id', clerkIds)
    for (const p of prefRows ?? []) {
      if (p.email_announcements === false) optedOut.add(p.clerk_user_id)
    }
  }

  // Emails — best-effort; never block on a single failure.
  let emailed = 0
  for (const m of recipients) {
    if (!m.email) continue
    if (m.clerk_user_id && optedOut.has(m.clerk_user_id)) continue
    try {
      const result = await sendLeadUpGatheringEmail({
        community,
        to: m.email,
        recipientName: m.preferred_name || m.first_name || 'there',
        title: gathering.title,
        when,
        location: gathering.location,
        link: gathering.link,
        imageUrl: gathering.image_url,
      })
      if (result.ok) emailed++
    } catch (err) {
      console.error('[lead-up notify] email failed:', err)
    }
  }

  const notified_at = new Date().toISOString()
  await db.from('lead_up_events').update({ notified_at }).eq('id', gathering.id)

  return NextResponse.json({ notified: bellRows.length, emailed, notified_at })
}

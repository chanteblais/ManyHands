import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'
import { resolveMemberForUser, memberDisplayName } from '@/lib/members'
import { notifyAdmin } from '@/lib/notify-admin'
import { parseDuesConfig, duesAppliesToMembers } from '@/lib/dues'

// Self-serve camp-dues report: POST { reported: boolean }.
// A member marks that they've sent their e-transfer (dues_reported_at, 068);
// an admin then reviews and confirms it in Community → Camp Dues. Members can
// also un-report a mistaken claim — but not once an admin has confirmed payment.
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const member = await resolveMemberForUser(community.id, userId)
  if (!member || member.status !== 'approved') {
    return NextResponse.json({ error: 'Only approved members can report dues' }, { status: 403 })
  }

  // Dues must be on and applied to members.
  const { data: cfgRow } = await db.from('page_content').select('value').eq('key', 'config_dues').maybeSingle()
  if (!duesAppliesToMembers(parseDuesConfig(cfgRow?.value))) {
    return NextResponse.json({ error: 'Camp dues are not being collected' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const reported = body?.reported
  if (typeof reported !== 'boolean') {
    return NextResponse.json({ error: 'reported (boolean) is required' }, { status: 400 })
  }

  // An admin-confirmed payment is the source of truth — a member can't change it.
  if (member.dues_paid_at) {
    return NextResponse.json({ success: true, dues_reported_at: member.dues_reported_at })
  }

  if (reported) {
    if (member.dues_reported_at) return NextResponse.json({ success: true, dues_reported_at: member.dues_reported_at })
    const now = new Date().toISOString()
    const { error } = await db.from('members').update({ dues_reported_at: now }).eq('id', member.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await notifyAdmin(community, {
      applicationId: member.application_id,
      eventType: 'dues_reported',
      message: `${memberDisplayName(member, 'A member')} reported paying camp dues`,
      details: { email: member.email },
    })
    return NextResponse.json({ success: true, dues_reported_at: now })
  }

  // Un-report (mistaken claim) — quiet, no admin notification.
  if (!member.dues_reported_at) return NextResponse.json({ success: true, dues_reported_at: null })
  const { error } = await db.from('members').update({ dues_reported_at: null }).eq('id', member.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, dues_reported_at: null })
}

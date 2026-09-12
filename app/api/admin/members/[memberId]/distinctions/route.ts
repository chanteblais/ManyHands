import { NextRequest, NextResponse } from 'next/server'
import { grantDistinction, revokeDistinction } from '@/lib/distinction-awards'
import { requireAdmin } from '@/lib/admin-auth'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { parseDistinctions } from '@/lib/distinctions'
import { postSourcedRadioEvent, achievementRadioPost } from '@/lib/radio'

// Admin manual grant / revoke of a distinction for a member.
//   POST   { distinctionId, note? }      → grant
//   DELETE ?distinctionId=...            → revoke

export async function POST(req: NextRequest, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { distinctionId, note } = await req.json().catch(() => ({}))
  if (typeof distinctionId !== 'string' || !distinctionId) {
    return NextResponse.json({ error: 'distinctionId required' }, { status: 400 })
  }

  const ok = await grantDistinction(params.memberId, distinctionId, adminId, typeof note === 'string' ? note : undefined)

  // Radio: a manual grant is the one distinction moment with a stored "when"
  // (rule-derived earns are computed, never stored — see docs/radio.md).
  if (ok) {
    const [{ data: member }, { data: configRow }] = await Promise.all([
      db
        .from('members')
        .select('clerk_user_id, preferred_name, first_name')
        .eq('id', params.memberId)
        .maybeSingle(),
      db
        .from('page_content')
        .select('value')
        .eq('key', 'config_distinctions')
        .maybeSingle(),
    ])
    const rule = parseDistinctions(configRow?.value).find(r => r.id === distinctionId)
    if (member && rule) {
      const actorName = member.preferred_name || member.first_name || 'A member'
      await postSourcedRadioEvent(community.id, 'achievement', {
        ...achievementRadioPost(actorName, rule.label, rule.engraving, rule.image || rule.glyph),
        actorClerkId: member.clerk_user_id,
        actorName,
        link: `/members/${params.memberId}`,
      })
    }
  }

  return ok
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: 'Failed to grant' }, { status: 500 })
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  const adminId = await requireAdmin()
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const distinctionId = new URL(req.url).searchParams.get('distinctionId')
  if (!distinctionId) return NextResponse.json({ error: 'distinctionId required' }, { status: 400 })

  const ok = await revokeDistinction(params.memberId, distinctionId)
  return ok
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: 'Failed to revoke' }, { status: 500 })
}

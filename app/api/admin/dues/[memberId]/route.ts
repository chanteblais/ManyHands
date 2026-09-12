import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'

// Admin camp-dues toggle, keyed by row id. POST { paid: boolean, note?, entity? }.
// `entity` = 'member' (default; the tracker + member detail page hold member.id)
// or 'volunteer' (the volunteers table, admin-tracked only — no self-report).
// Collected manually this year — this just records who paid; a future Stripe
// webhook would set the same `dues_paid_at`.
export async function POST(req: NextRequest, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  const userId = await requireAdmin()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json().catch(() => ({}))
  const paid = body?.paid
  if (typeof paid !== 'boolean') {
    return NextResponse.json({ error: 'paid (boolean) is required' }, { status: 400 })
  }
  const note = typeof body?.note === 'string' ? body.note.trim() : ''
  const table = body?.entity === 'volunteer' ? 'volunteers' : 'members'

  const { data: row } = await db
    .from(table)
    .select('id')
    .eq('id', params.memberId)
    .single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // paid=true confirms (records payment). paid=false is a full reset to "owed"
  // (admin "Undo" or "Not received"). For members that also clears any
  // self-report (068); volunteers have no such column.
  const base = paid
    ? { dues_paid_at: new Date().toISOString(), dues_paid_by: userId, dues_note: note || null }
    : { dues_paid_at: null, dues_paid_by: null, dues_note: null }
  const patch = table === 'members' && !paid ? { ...base, dues_reported_at: null } : base

  const { error } = await db.from(table).update(patch).eq('id', row.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, dues_paid_at: base.dues_paid_at })
}

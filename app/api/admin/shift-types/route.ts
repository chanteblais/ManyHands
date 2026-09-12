import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminShiftTypes } from '@/lib/admin-program-data'

// Shift types are requirement-free kinds of shift (Setup, Service, Tea, …).
// Whether a shift is *required* — and for whom — lives on groups/roles (conditional)
// or on attunement tasks (universal), never on the type itself.

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  try {
    return NextResponse.json({ shiftTypes: await getAdminShiftTypes(community.id) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json()
  if (!body.name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data, error } = await db
    .from('shift_types')
    .insert({ name: body.name, icon: body.icon || null, sort_order: body.sort_order ?? 0 })
    .select('id, name, icon, sort_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ shiftType: data })
}

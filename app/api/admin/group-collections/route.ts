import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'

// Group Collections — the configurable container above leaf `groups`.
// See migration 042 + lib/group-collections.ts.
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data, error } = await db
    .from('group_collections')
    .select('id, name, description, selection, show_on_profile, self_join, sort_order')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ collections: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json()
  const { name, description, selection, show_on_profile, self_join, sort_order } = body

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (selection && selection !== 'single' && selection !== 'multi') {
    return NextResponse.json({ error: 'selection must be single or multi' }, { status: 400 })
  }

  const { data, error } = await db
    .from('group_collections')
    .insert({
      name,
      description: description ?? null,
      selection: selection ?? 'multi',
      show_on_profile: show_on_profile ?? true,
      self_join: self_join ?? false,
      sort_order: sort_order ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ collection: data })
}

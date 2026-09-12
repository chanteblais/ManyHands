import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'
import { pageContentTag } from '@/lib/page-content'

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data, error } = await db
    .from('page_content')
    .select('key, value')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const content = Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
  return NextResponse.json({ content })
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const updates: Record<string, string> = await req.json()

  const rows = Object.entries(updates).map(([key, value]) => ({
    key,
    value,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await db
    .from('page_content')
    // PK is still `key` (not `(community_id, key)`) until migration 075 — keep onConflict on it.
    .upsert(rows, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invalidate every cached getPageContent() read (lib/page-content.ts).
  // Next 16 semantics: the 'max' profile marks entries stale immediately —
  // one request may still see the old value (SWR) while the fresh read runs.
  // Admin editors are unaffected: this route's GET reads the table directly.
  revalidateTag(pageContentTag(community.id), 'max')
  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminLeadUpEvents } from '@/lib/admin-program-data'

// GET — all lead-up gatherings with their RSVP headcounts (admin view).
// Assembly lives in lib/admin-program-data.ts (shared with /admin/program's
// server render); this route is the client's refresh path.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const community = await getCommunity()

  try {
    return NextResponse.json({ events: await getAdminLeadUpEvents(community.id) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json()

  // Place new gathering at the end.
  const { data: last } = await db
    .from('lead_up_events')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sort_order = (last?.sort_order ?? 0) + 1

  const { data, error } = await db
    .from('lead_up_events')
    .insert([{
      title: body.title,
      description: body.description || null,
      event_date: body.event_date || null,
      start_time: body.start_time || null,
      end_time: body.end_time || null,
      location: body.location || null,
      link: body.link || null,
      host: body.host || null,
      image_url: body.image_url || null,
      visible: body.visible ?? true,
      sort_order,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

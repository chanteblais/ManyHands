import { NextRequest, NextResponse } from 'next/server'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { weekdayFromISO } from '@/lib/shift-hours'
import { requireAdmin } from '@/lib/admin-auth'
import { getAdminScheduleEvents } from '@/lib/admin-program-data'

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const community = await getCommunity()
  const db = tenantDb(community.id)

  try {
    return NextResponse.json({ events: await getAdminScheduleEvents(community.id) })
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

  // Place new event at the end of its group
  const { data: last } = await db
    .from('schedule_events')
    .select('sort_order')
    .eq('is_recurring', body.is_recurring ?? false)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sort_order = (last?.sort_order ?? 0) + 1

  const participation_type = body.participation_type ?? 'general'
  const shift_type_id = participation_type === 'shift' ? (body.shift_type_id ?? null) : null

  const { data, error } = await db
    .from('schedule_events')
    .insert([{
      // `day` derives from the real date when one is set (wrong-weekday-proof).
      day: weekdayFromISO(body.event_date) ?? body.day ?? '',
      time: body.time,
      title: body.title,
      subtitle: body.subtitle || null,
      detail_desc: body.detail_desc || null,
      icon_type: body.icon_type || 'star',
      sort_order,
      visible: body.visible ?? true,
      highlight: body.highlight ?? false,
      is_recurring: body.is_recurring ?? false,
      // Recurring only: NULL = every day; an array of ISO dates = those days.
      recurrence_days: body.is_recurring ? (body.recurrence_days ?? null) : null,
      // Off = kept off the schedule page + home teaser (still signable/ackable).
      show_on_schedule: body.show_on_schedule ?? true,
      participation_type,
      shift_type_id,
      // Every event carries structured times (not just shifts) — the display
      // `time` string is derived from them client-side.
      start_time: body.start_time ?? null,
      end_time: body.end_time ?? null,
      requires_ack: participation_type === 'mandatory' ? (body.requires_ack ?? false) : false,
      event_date: body.event_date ?? null,
      // Capacity only means something on signable shifts.
      capacity: participation_type === 'shift' ? (body.capacity ?? null) : null,
      // Lead roles only make sense on signable shifts (049).
      needs_lead: participation_type === 'shift' ? (body.needs_lead ?? false) : false,
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

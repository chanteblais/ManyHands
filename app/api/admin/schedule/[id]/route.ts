import { NextRequest, NextResponse } from 'next/server'
import { tenantDb, type TenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { weekdayFromISO } from '@/lib/shift-hours'
import { requireAdmin } from '@/lib/admin-auth'
import { eventRangeDays, isValidOccurrence } from '@/lib/shift-occurrences'

// "Save for just this night" (calendar-style occurrence exception): carve one
// night out of a recurring event into its own one-off row. The new row is a
// copy of the series with the edit's changes applied; the night's signups MOVE
// to it (occurrence_date → NULL, the one-off convention, so rosters/hours/
// reminders follow the night); the series loses the night from recurrence_days.
// A series whose last night was carved out is deleted outright — an empty
// recurrence_days array would read as "every day" downstream.
const SPLIT_COPY_KEYS = ['time','title','subtitle','detail_desc','icon_type','visible','highlight','capacity','participation_type','shift_type_id','requires_ack','start_time','end_time','needs_lead','show_on_schedule'] as const

async function splitNight(db: TenantDb, id: string, night: string, body: Record<string, unknown>) {
  const { data: row, error: rowError } = await db
    .from('schedule_events').select('*').eq('id', id).single()
  if (rowError || !row) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (!row.is_recurring) return NextResponse.json({ error: 'Only recurring events can be split by night' }, { status: 400 })

  // "Every day" series need the configured range to know their concrete nights.
  const { data: cfg } = await db
    .from('page_content').select('key, value')
    .in('key', ['config_event_start_date', 'config_event_end_date'])
  const cfgMap = Object.fromEntries((cfg ?? []).map(r => [r.key, r.value]))
  const rangeDays = eventRangeDays(cfgMap['config_event_start_date'], cfgMap['config_event_end_date'])
  if (row.recurrence_days == null && rangeDays.length === 0) {
    return NextResponse.json({ error: 'This event repeats every day but no event dates are configured — set them in Configure → Event Dates first.' }, { status: 400 })
  }
  if (!isValidOccurrence(row, night, rangeDays)) {
    return NextResponse.json({ error: `${night} is not one of this event's nights.` }, { status: 400 })
  }

  // The one-off copy: series values, overridden by the edit's changes, with the
  // one-off invariants forced and the POST route's participation normalization.
  const copy: Record<string, unknown> = {}
  for (const key of SPLIT_COPY_KEYS) copy[key] = key in body ? body[key] : row[key]
  const pType = copy.participation_type ?? 'general'
  copy.shift_type_id = pType === 'shift' ? copy.shift_type_id ?? null : null
  copy.capacity = pType === 'shift' ? copy.capacity ?? null : null
  copy.needs_lead = pType === 'shift' ? copy.needs_lead ?? false : false
  copy.requires_ack = pType === 'mandatory' ? copy.requires_ack ?? false : false
  copy.is_recurring = false
  copy.recurrence_days = null
  copy.event_date = night
  copy.day = weekdayFromISO(night) ?? ''
  copy.sort_order = row.sort_order

  const { data: splitEvent, error: insertError } = await db
    .from('schedule_events').insert([copy]).select().single()
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // Move the night's signups onto the new one-off (NULL date = its single
  // occurrence). Members keep their spot — that's the point of the split.
  const { error: moveError } = await db
    .from('member_shift_signups')
    .update({ schedule_event_id: splitEvent.id, occurrence_date: null })
    .eq('schedule_event_id', id)
    .eq('occurrence_date', night)
  if (moveError) {
    return NextResponse.json({ error: `The night became its own event, but moving its signups failed: ${moveError.message}. Check the rosters before retrying.` }, { status: 500 })
  }

  // `[]` means "every day" everywhere else (shiftOccurrenceDates, and it's how
  // isValidOccurrence let `night` through above) — normalize it the same way
  // here, or an empty array would read as "no nights left" and drop the series.
  const seriesNights: string[] = row.recurrence_days?.length ? row.recurrence_days : rangeDays
  const remaining = seriesNights.filter((d: string) => d !== night)
  if (remaining.length === 0) {
    const { error: dropError } = await db.from('schedule_events').delete().eq('id', id)
    if (dropError) return NextResponse.json({ error: `The night became its own event, but removing the now-empty series failed: ${dropError.message}.` }, { status: 500 })
    return NextResponse.json({ event: null, splitEvent, removedSeries: true })
  }
  const { data: updated, error: trimError } = await db
    .from('schedule_events').update({ recurrence_days: remaining }).eq('id', id).select().single()
  if (trimError) {
    return NextResponse.json({ error: `The night became its own event, but removing it from the series failed: ${trimError.message}. Uncheck ${night} in the series' Repeats on to finish.` }, { status: 500 })
  }
  return NextResponse.json({ event: updated, splitEvent, removedSeries: false })
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const body = await req.json()
  if (typeof body.split_night === 'string') {
    return splitNight(db, params.id, body.split_night, body)
  }
  // Direct passthrough fields. Capacity is NOT here — it's normalized against
  // participation_type below (only shifts carry one).
  const allowed = ['day','time','title','subtitle','detail_desc','icon_type','sort_order','visible','highlight','is_recurring','participation_type','shift_type_id','requires_ack','event_date','start_time','end_time','needs_lead','recurrence_days','show_on_schedule']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  // `day` derives from the real date whenever one is set (wrong-weekday-proof).
  if ('event_date' in body) {
    const derived = weekdayFromISO(body.event_date)
    if (derived) updates.day = derived
  }
  // Recurrence days only make sense on recurring events.
  if ('is_recurring' in body && !body.is_recurring) updates.recurrence_days = null

  // Normalize the shift-only fields whenever participation/type/capacity is
  // touched, using the incoming value where present, else the row's current value.
  if ('participation_type' in body || 'shift_type_id' in body || 'capacity' in body) {
    const { data: existing } = await db
      .from('schedule_events').select('participation_type, shift_type_id, capacity').eq('id', params.id).single()
    const pType = 'participation_type' in body ? body.participation_type : existing?.participation_type ?? 'general'
    const stId = 'shift_type_id' in body ? body.shift_type_id : existing?.shift_type_id ?? null
    const cap = 'capacity' in body ? body.capacity : existing?.capacity ?? null
    // Keep shift_type_id/requires_ack/capacity consistent with participation_type.
    updates.shift_type_id = pType === 'shift' ? stId : null
    if (pType !== 'mandatory') updates.requires_ack = false
    updates.capacity = pType === 'shift' ? cap : null
  }

  const { data, error } = await db
    .from('schedule_events')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Removing a night from a recurring event must also remove that night's
  // signups — member_shift_signups rows are occurrence_date-keyed and the
  // ON DELETE CASCADE only covers whole-event deletes, so a trimmed night
  // would otherwise keep phantom signups (counted by hours/rosters/reminders)
  // for a night that no longer exists. Only runs when the saved row holds a
  // materialised day subset; going back to "every day" (NULL) removes nothing.
  // The admin UI confirms the count before sending this PATCH.
  if ('recurrence_days' in body && data?.is_recurring && Array.isArray(data.recurrence_days) && data.recurrence_days.length > 0) {
    const keep = new Set<string>(data.recurrence_days)
    const { data: signups, error: signupsError } = await db
      .from('member_shift_signups')
      .select('id, occurrence_date')
      .eq('schedule_event_id', params.id)
    if (signupsError) {
      return NextResponse.json({ error: `The event was saved, but checking the removed nights' signups failed: ${signupsError.message}. Re-save to retry.` }, { status: 500 })
    }
    const staleIds = (signups ?? [])
      .filter(s => s.occurrence_date && !keep.has(s.occurrence_date))
      .map(s => s.id)
    if (staleIds.length > 0) {
      const { error: cleanupError } = await db
        .from('member_shift_signups')
        .delete()
        .in('id', staleIds)
      if (cleanupError) {
        return NextResponse.json({ error: `The event was saved, but deleting the removed nights' ${staleIds.length} signup(s) failed: ${cleanupError.message}. Re-save to retry.` }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ event: data })
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { error } = await db
    .from('schedule_events')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

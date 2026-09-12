import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { shiftColorIndexMap } from '@/lib/shift-colors'
import { buildScheduleDays } from '@/lib/schedule-days'
import { displayPlacement } from '@/lib/late-night'
import { PersonalScheduleCalendar, type PersonalEvent } from './PersonalScheduleCalendar'

type Props = {
  userId: string
}

// A member's personal schedule = mandatory events (everyone attends) + the
// shifts they actually hold (member_shift_signups). The group says WHAT you
// contribute, the shifts you signed up for say WHEN.
export async function PersonalSchedule({ userId }: Props) {
  const community = await getCommunity()
  const db = tenantDb(community.id)
  const EVENT_COLS = 'id, day, time, title, subtitle, detail_desc, icon_type, highlight, event_date, participation_type, shift_type_id, is_recurring'

  const [{ data: mandatoryEvents }, { data: heldRows }, { data: shiftTypes }] = await Promise.all([
    db
      .from('schedule_events')
      .select(EVENT_COLS)
      .eq('participation_type', 'mandatory')
      .eq('visible', true)
      .order('sort_order', { ascending: true }),
    db
      .from('member_shift_signups')
      .select(`occurrence_date, schedule_events(${EVENT_COLS})`)
      .eq('clerk_user_id', userId),
    db.from('shift_types').select('id').order('sort_order'),
  ])

  // Palette slot per shift type (registry order) — drives the card colours.
  const colorIndex = shiftColorIndexMap(shiftTypes ?? [])
  const withColor = <T extends { shift_type_id?: string | null }>(ev: T) => ({
    ...ev,
    shift_color_index: ev.shift_type_id != null ? colorIndex[ev.shift_type_id] ?? null : null,
  })

  const seenIds = new Set<string>()
  const events: PersonalEvent[] = []

  // Mandatory events (shown to everyone)
  for (const ev of mandatoryEvents ?? []) {
    seenIds.add(ev.id)
    events.push({ ...withColor(ev), isPersonal: false })
  }

  // Shifts the member holds. Each held night is placed on its own date: a
  // recurring shift held for two nights shows twice (each night is a regular
  // shift). occurrence_date overrides the event's anchor date for placement.
  type HeldEvent = Omit<PersonalEvent, 'isPersonal' | 'shift_color_index'> & { shift_type_id?: string | null; is_recurring?: boolean | null }
  const heldEntries: { ev: HeldEvent | null; occ: string | null }[] =
    (heldRows ?? []).map(r => ({ ev: r.schedule_events as unknown as HeldEvent | null, occ: (r.occurrence_date as string | null) ?? null }))
  for (const { ev, occ } of heldEntries) {
    if (!ev) continue
    const recurring = !!ev.is_recurring && !!occ
    // Recurring holds get a per-night id + land on their night; a non-recurring
    // hold keeps the event id and date (identical to the pre-occurrence behaviour).
    const id = recurring ? `${ev.id}::${occ}` : ev.id
    const placed = recurring ? { ...ev, event_date: occ } : ev
    if (seenIds.has(id)) continue
    // Same event already shown (e.g. mandatory): just mark it personal rather
    // than adding a duplicate.
    const existing = events.find(e => e.id === id)
    if (existing) { existing.isPersonal = true; continue }
    seenIds.add(id)
    events.push({ ...withColor(placed), id, isPersonal: true })
  }

  if (events.length === 0) return null

  // Day columns from the member's events' DISPLAY dates (only days they have
  // something on) — an after-midnight event columns under the previous night
  // (lib/late-night.ts), so its true morning date must not spawn a column.
  const days = buildScheduleDays(events.map(e =>
    displayPlacement(e.time, (e as { event_date?: string | null }).event_date ?? null).displayDate,
  ))

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <PersonalScheduleCalendar events={events} days={days} />
    </div>
  )
}

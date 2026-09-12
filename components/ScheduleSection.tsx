import { tenantDb } from '@/lib/tenant-db'
import { getPageContent } from '@/lib/page-content'
import { getCommunity } from '@/lib/community'
import { ScheduleCalendarClient } from '@/components/ScheduleCalendarClient'
import { shiftColorIndexMap } from '@/lib/shift-colors'
import { buildScheduleDays } from '@/lib/schedule-days'
import { displayPlacement } from '@/lib/late-night'
export { EventIcon } from '@/components/EventIcon'
export { ICON_TYPES } from '@/components/EventIcon'

export async function ScheduleSection() {
  const community = await getCommunity()
  const db = tenantDb(community.id)
  const [{ data: eventsRaw }, { data: shiftTypes }, config] = await Promise.all([
    db
      .from('schedule_events')
      .select('id, day, time, title, subtitle, detail_desc, icon_type, highlight, is_recurring, recurrence_days, event_date, participation_type, shift_type_id')
      .eq('visible', true)
      // Admin can keep an event off the schedule page while it stays signable.
      .eq('show_on_schedule', true)
      .order('sort_order', { ascending: true }),
    db.from('shift_types').select('id').order('sort_order'),
    getPageContent(community.id, ['config_event_start_date', 'config_event_end_date']),
  ])

  // Each shift type gets a stable palette slot from its registry position.
  const colorIndex = shiftColorIndexMap(shiftTypes ?? [])
  const data = (eventsRaw ?? []).map(e => ({
    ...e,
    shift_color_index: e.shift_type_id != null ? colorIndex[e.shift_type_id] ?? null : null,
  }))

  // Day columns: the configured event range ∪ every date an event DISPLAYS on
  // (late-night convention — an after-midnight event belongs to the previous
  // night's column, so its true morning date must not spawn a column).
  const days = buildScheduleDays(
    data.filter(e => !e.is_recurring).map(e => displayPlacement(e.time, e.event_date).displayDate),
    config['config_event_start_date'],
    config['config_event_end_date'],
  )

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <p style={{ fontSize: '0.65rem', letterSpacing: '0.35em', textTransform: 'uppercase', color: '#C8A848', opacity: 0.7, marginBottom: '0.4rem' }}>
          ✦ &nbsp;Schedule&nbsp; ✦
        </p>
        <p style={{ fontSize: '0.82rem', fontStyle: 'italic', opacity: 0.45 }}>
          All times approximate. Attunement occurs continuously. Results may vary.
        </p>
      </div>
      <ScheduleCalendarClient events={data ?? []} days={days} />
    </div>
  )
}

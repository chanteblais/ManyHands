// Dev-only sandbox: the member schedule calendar over live events PLUS a few
// synthetic late-night rows, so the after-midnight rendering can be checked
// without planting test events in the shared database. 404 in production.
import { notFound } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { shiftColorIndexMap } from '@/lib/shift-colors'
import { buildScheduleDays } from '@/lib/schedule-days'
import { displayPlacement } from '@/lib/late-night'
import { ScheduleCalendarClient } from '@/components/ScheduleCalendarClient'

const SYNTHETIC = [
  {
    id: 'dev-latenight-1', day: 'Saturday', time: '9:00 PM – 12:30 AM',
    title: '[TEST] Overnight Prawm', subtitle: null, detail_desc: 'Ends after midnight — block should run past the Midnight line.',
    icon_type: '/asset-library/icons/star.webp', highlight: false, is_recurring: false,
    recurrence_days: null, event_date: '2026-07-25', participation_type: 'general', shift_type_id: null,
  },
  {
    id: 'dev-latenight-2', day: 'Sunday', time: '1:00 AM – 3:00 AM',
    title: '[TEST] Afterparty', subtitle: null, detail_desc: 'Dated Jul 26 (true date) — should show late Saturday night, at the bottom of the Jul 25 column.',
    icon_type: '/asset-library/icons/star.webp', highlight: false, is_recurring: false,
    recurrence_days: null, event_date: '2026-07-26', participation_type: 'general', shift_type_id: null,
  },
  {
    id: 'dev-latenight-3', day: '', time: '12:15 AM – 1:15 AM',
    title: '[TEST] Midnight Tea (recurring)', subtitle: null, detail_desc: 'Recurring on Jul 23 + 24 chips — each chip means that night.',
    icon_type: '/asset-library/icons/star.webp', highlight: false, is_recurring: true,
    recurrence_days: ['2026-07-23', '2026-07-24'], event_date: null, participation_type: 'general', shift_type_id: null,
  },
]

export default async function DevSchedulePage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const [{ data: eventsRaw }, { data: shiftTypes }, { data: configRows }] = await Promise.all([
    db
      .from('schedule_events')
      .select('id, day, time, title, subtitle, detail_desc, icon_type, highlight, is_recurring, recurrence_days, event_date, participation_type, shift_type_id')
      .eq('visible', true)
      .eq('show_on_schedule', true)
      .order('sort_order', { ascending: true }),
    db.from('shift_types').select('id').order('sort_order'),
    db.from('page_content').select('key, value').in('key', ['config_event_start_date', 'config_event_end_date']),
  ])

  const colorIndex = shiftColorIndexMap(shiftTypes ?? [])
  const data = [...(eventsRaw ?? []), ...SYNTHETIC].map(e => ({
    ...e,
    shift_color_index: e.shift_type_id != null ? colorIndex[e.shift_type_id] ?? null : null,
  }))

  const config = Object.fromEntries((configRows ?? []).map(r => [r.key, r.value]))
  const days = buildScheduleDays(
    data.filter(e => !e.is_recurring).map(e => displayPlacement(e.time, e.event_date).displayDate),
    config['config_event_start_date'],
    config['config_event_end_date'],
  )

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <p style={{ color: 'var(--gold)', fontSize: '0.8rem', opacity: 0.7, marginBottom: '2rem' }}>
        Dev sandbox — live schedule + [TEST] late-night rows (not in the database).
      </p>
      <ScheduleCalendarClient events={data} days={days} />
    </div>
  )
}

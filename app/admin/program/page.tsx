import { HandsBackdrop } from '@/components/HandsBackdrop'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { requireAdmin } from '@/lib/admin-auth'
import { AdminNav } from '../AdminNav'
import { CategoryHeading } from '../CategoryHeading'
import { NotificationBell } from '../NotificationBell'
import { ScheduleManager } from '../ScheduleManager'
import { LeadUpGatheringsManager } from '../LeadUpGatheringsManager'
import { ShiftSignupToggle } from '../ShiftSignupToggle'
import { PROGRAM_CATEGORIES } from '../admin-sections'
import { getAdminRunway } from '@/lib/admin-attention'
import { getCommunity } from '@/lib/community'
import {
  getAdminScheduleEvents,
  getAdminShiftTypes,
  getAdminRosters,
  getAdminLeadUpEvents,
} from '@/lib/admin-program-data'

// A failed section fetch degrades to undefined — the manager then runs its own
// mount fetch and shows its usual retry UI instead of the whole page erroring.
const safe = <T,>(p: Promise<T>): Promise<T | undefined> => p.catch(() => undefined)

// Soft shared backdrop that holds each workspace together as one section —
// a barely-lifted cream wash with a hairline gold edge.
const workspacePanel: React.CSSProperties = {
  padding: '1.4rem 1.5rem',
  marginBottom: '3rem',
  borderRadius: '0.9rem',
  border: '1px solid rgba(200,168,72,0.14)',
  background: 'rgba(243,237,230,0.03)',
}

export default async function ProgramPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  if (!(await requireAdmin())) redirect('/')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const [
    { data: configRows },
    { data: notifications },
    runway,
    scheduleEvents,
    shiftTypeRows,
    rosters,
    leadUpEvents,
  ] = await Promise.all([
    db
      .from('page_content')
      .select('key, value')
      .in('key', ['config_shift_signup_open', 'config_event_start_date', 'config_event_end_date']),
    db
      .from('admin_notifications')
      .select('id, application_id, event_type, message, details, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(20),
    getAdminRunway(community.id),
    // The managers' section data, server-rendered so the tab paints populated
    // (no mount-fetch wave) — same assembly the /api/admin routes serve.
    safe(getAdminScheduleEvents(community.id)),
    safe(getAdminShiftTypes(community.id)),
    safe(getAdminRosters(community.id)),
    safe(getAdminLeadUpEvents(community.id)),
  ])
  const configMap = Object.fromEntries((configRows ?? []).map(r => [r.key, r.value]))
  const shiftSignupOpen = configMap['config_shift_signup_open'] !== 'false'
  const eventRangeStart = configMap['config_event_start_date'] ?? ''
  const eventRangeEnd = configMap['config_event_end_date'] ?? ''

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1, overflowX: 'clip' }}>

      {/* Decorative hands */}
      <HandsBackdrop />

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 1.5rem 6rem', position: 'relative', zIndex: 1 }}>

        <AdminNav sections={PROGRAM_CATEGORIES} runway={runway} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
          <NotificationBell initialNotifications={notifications ?? []} />
        </div>

        <h1 style={{ fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', color: '#C8A848', marginBottom: '0.5rem', textAlign: 'center' }}>
          Program
        </h1>
        <p style={{ textAlign: 'center', opacity: 0.5, fontSize: '0.85rem', marginBottom: '2.5rem' }}>
          The schedule of camp and the gatherings on the runway to it
        </p>

        {/* ═══════════════ SCHEDULE ═══════════════ */}
        <CategoryHeading id="schedule" large />

        <div style={workspacePanel}>
          <ScheduleManager
            rangeStart={eventRangeStart}
            rangeEnd={eventRangeEnd}
            initialEvents={scheduleEvents}
            initialShiftTypes={shiftTypeRows?.map(t => ({ id: t.id, name: t.name }))}
            initialRosters={rosters}
          >
            <ShiftSignupToggle initialOpen={shiftSignupOpen} />
          </ScheduleManager>
        </div>

        {/* ═══════════════ LEAD-UP GATHERINGS ═══════════════ */}
        <CategoryHeading id="lead-up" large />

        <div style={workspacePanel}>
          <LeadUpGatheringsManager rangeStart={eventRangeStart} rangeEnd={eventRangeEnd} initialEvents={leadUpEvents} />
        </div>

      </div>
    </div>
  )
}

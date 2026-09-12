import { HandsBackdrop } from '@/components/HandsBackdrop'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { requireAdmin } from '@/lib/admin-auth'
import { AdminNav } from '../AdminNav'
import { CategoryHeading } from '../CategoryHeading'
import { CollapsibleSection } from '../CollapsibleSection'
import { NotificationBell } from '../NotificationBell'
import { ProfileFieldsManager } from '../ProfileFieldsManager'
import { DistinctionsManager } from '../DistinctionsManager'
import { AttunementTasksManager } from '../AttunementTasksManager'
import { DepartmentsManager } from '../DepartmentsManager'
import { GroupsManager } from '../GroupsManager'
import { ShiftTypesManager } from '../ShiftTypesManager'
import { EventDatesManager } from '../EventDatesManager'
import { AdminsManager } from '../AdminsManager'
import { PollManagersManager } from '../PollManagersManager'
import { DebugSection } from '../DebugSection'
import { CONFIGURE_CATEGORIES } from '../admin-sections'
import { parseAttunementTasks, parseAttunementNudgeDays } from '@/lib/site-config'
import { getGroupCollections } from '@/lib/group-collections'
import { parseDistinctions } from '@/lib/distinctions'
import { parseProfileFields, distinctionCatalog } from '@/lib/profile-fields'
import { getAdminRunway } from '@/lib/admin-attention'
import { getCommunity } from '@/lib/community'
import { settingHour, zoneLabel, DEFAULT_NUDGE_HOUR_LOCAL } from '@/lib/community-time'

// "3 groups" / "1 group" — the panel status chips speak in counted nouns.
const counted = (n: number, singular: string, plural = `${singular}s`) =>
  `${n} ${n === 1 ? singular : plural}`

export default async function ConfigurePage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  if (!(await requireAdmin())) redirect('/')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const [
    { data: configRows },
    { data: groupIconRows },
    { collections: groupCollections, uncollected },
    { data: shiftTypeRows },
    { count: departmentCount },
    { data: notifications },
    { data: applications },
    runway,
  ] = await Promise.all([
    db
      .from('page_content')
      .select('key, value')
      .in('key', ['config_attunement_tasks', 'config_distinctions', 'config_profile_fields', 'config_event_start_date', 'config_event_end_date', 'config_attunement_nudge_days']),
    // Group icon images — offered as medal art in the distinctions builder.
    db
      .from('groups')
      .select('name, icon_image')
      .not('icon_image', 'is', null)
      .order('sort_order'),
    // Collections + their group counts — power the Attunement "collection membership"
    // requirement (which collection, and the cap on how many groups can be required).
    getGroupCollections(community.id),
    // Shift types — offered as targets for a shift-hours attunement task.
    db
      .from('shift_types').select('id, name').order('sort_order'),
    // Department count — the Departments panel's status chip (the manager
    // itself loads its data client-side).
    db
      .from('departments').select('id', { count: 'exact', head: true }),
    db
      .from('admin_notifications')
      .select('id, application_id, event_type, message, details, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(20),
    // Approved members + which of them are admins in Clerk (for the Admins manager).
    db
      .from('applications')
      .select('clerk_user_id, first_name, last_name, preferred_name, email, status')
      .eq('status', 'approved'),
    getAdminRunway(community.id),
  ])

  const configMap = Object.fromEntries((configRows ?? []).map(r => [r.key, r.value]))
  const attunementTasks = parseAttunementTasks(configMap['config_attunement_tasks'])
  const distinctions = parseDistinctions(configMap['config_distinctions'])
  const profileFields = parseProfileFields(configMap['config_profile_fields'])
  // Facts a distinction rule may reference — derived from the registry.
  const distinctionFactCatalog = distinctionCatalog(profileFields)

  const groupIconOptions = (groupIconRows ?? [])
    .filter(g => g.icon_image)
    .map(g => ({ name: g.name as string, image: g.icon_image as string }))

  const attunementCollections = groupCollections.map(c => ({ id: c.id, name: c.name, groupCount: c.groups.length }))
  const totalGroupCount = groupCollections.reduce((n, c) => n + c.groups.length, 0) + uncollected.length

  const shiftTypeOptions = (shiftTypeRows ?? []).map(s => ({ id: s.id as string, name: s.name as string }))

  const approvedWithClerk = (applications ?? []).filter(a => a.clerk_user_id)
  // Permissions are columns on the member row (branch 1d) — one scoped query,
  // no Clerk round-trip.
  const { data: permRows } = await db
    .from('members')
    .select('clerk_user_id, role, can_manage_polls')
    .in('clerk_user_id', approvedWithClerk.map(a => a.clerk_user_id!))
  const permById = new Map((permRows ?? []).map(r => [r.clerk_user_id as string, r]))
  const adminMembers = approvedWithClerk.map(a => {
    const p = permById.get(a.clerk_user_id!)
    return {
      clerk_user_id: a.clerk_user_id!,
      first_name: a.first_name,
      last_name: a.last_name,
      preferred_name: a.preferred_name ?? null,
      email: a.email,
      isAdmin: p?.role === 'admin',
      canManagePolls: p?.can_manage_polls === true,
    }
  })

  // Approved members shaped for the Groups roster (assign members to groups).
  const groupMembers = approvedWithClerk.map(a => ({
    clerk_user_id: a.clerk_user_id!,
    displayName: [a.preferred_name || a.first_name, a.last_name].filter(Boolean).join(' '),
    email: a.email,
  }))

  // ── Panel status chips — the collapsed page doubles as a state-of-the-camp
  // overview, so each panel header carries a live one-glance count.
  const customFieldCount = profileFields.filter(f => !f.system && !f.locked).length
  const systemFieldCount = profileFields.filter(f => f.system).length
  const activeDistinctions = distinctions.filter(d => d.enabled).length
  const activeTasks = attunementTasks.filter(t => t.enabled).length
  const adminCount = adminMembers.filter(m => m.isAdmin).length
  const pollManagerCount = adminMembers.filter(m => m.canManagePolls && !m.isAdmin).length

  const eventStart = configMap['config_event_start_date'] ?? ''
  const eventEnd = configMap['config_event_end_date'] ?? ''
  const fmtDay = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`)
    return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  const startLabel = eventStart ? fmtDay(eventStart) : null
  const endLabel = eventEnd ? fmtDay(eventEnd) : null
  const dayCount = startLabel && endLabel
    ? Math.round((new Date(`${eventEnd}T00:00:00`).getTime() - new Date(`${eventStart}T00:00:00`).getTime()) / 86400000) + 1
    : 0
  const eventDatesStatus = startLabel && endLabel && dayCount > 0
    ? `${startLabel} – ${endLabel} · ${counted(dayCount, 'day')}`
    : 'not set'

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1, overflowX: 'clip' }}>

      {/* Decorative hands */}
      <HandsBackdrop />

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 1.5rem 6rem', position: 'relative', zIndex: 1 }}>

        <AdminNav sections={CONFIGURE_CATEGORIES} runway={runway} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
          <NotificationBell initialNotifications={notifications ?? []} />
        </div>

        <h1 style={{ fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', color: '#C8A848', marginBottom: '0.5rem', textAlign: 'center' }}>
          Configure
        </h1>
        <p style={{ textAlign: 'center', opacity: 0.5, fontSize: '0.85rem', marginBottom: '2.5rem' }}>
          Define the forms, fields, recognition, and structure the camp runs on
        </p>

        {/* ═══════════════ FORMS & FIELDS ═══════════════ */}
        <CategoryHeading id="forms" large />

        {/* The application form builder lives on its own full-screen page —
            styled as a sibling of the panels below so the section reads as one set. */}
        <a
          href="/admin/configure/application-form"
          style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: '0.5rem 1rem',
            padding: '1.1rem 1.3rem',
            marginBottom: '1.1rem',
            borderRadius: '0.9rem',
            border: '1px solid rgba(200,168,72,0.14)',
            background: 'rgba(243,237,230,0.03)',
            textDecoration: 'none',
          }}
        >
          <span style={{ flex: '1 1 16rem', minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '0.78rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C8A848' }}>
              Application Form
            </span>
            <span style={{ display: 'block', marginTop: '0.4rem', fontSize: '0.8rem', lineHeight: 1.5, color: '#F3EDE6', opacity: 0.5 }}>
              Design the member application — sections, fields, and copy
            </span>
          </span>
          <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: '#C8A848', opacity: 0.6, whiteSpace: 'nowrap', paddingTop: '0.05rem' }}>
            open the builder →
          </span>
        </a>

        <CollapsibleSection
          panel
          title="Profile Fields"
          summary="The details you keep about each member — they feed the application form, profiles, and distinction rules"
          status={`${counted(customFieldCount, 'field')} · ${systemFieldCount} automatic`}
        >
          <ProfileFieldsManager initialFields={profileFields} />
        </CollapsibleSection>

        {/* ═══════════════ RECOGNITION & TASKS ═══════════════ */}
        <CategoryHeading id="recognition" large />

        <CollapsibleSection
          panel
          title="Distinctions"
          summary="Earned medals in each member's Cabinet of Distinctions"
          status={counted(activeDistinctions, 'medal')}
        >
          <DistinctionsManager initialDistinctions={distinctions} groupIconOptions={groupIconOptions} factCatalog={distinctionFactCatalog} />
        </CollapsibleSection>

        <CollapsibleSection
          panel
          title="Attunement Tasks"
          summary="The checklist each member completes on their profile"
          status={counted(activeTasks, 'task')}
        >
          <AttunementTasksManager sendHour={settingHour(community.settings, 'nudge_hour_local', DEFAULT_NUDGE_HOUR_LOCAL)} timezoneLabel={zoneLabel(community.timezone)} initialTasks={attunementTasks} collections={attunementCollections} totalGroupCount={totalGroupCount} shiftTypes={shiftTypeOptions} initialNudgeDays={parseAttunementNudgeDays(configMap['config_attunement_nudge_days'])} />
        </CollapsibleSection>

        {/* ═══════════════ STRUCTURE ═══════════════ */}
        <CategoryHeading id="structure" large />

        <CollapsibleSection
          panel
          title="Event Dates"
          summary="When the event runs — drives the schedule calendars' day columns"
          status={eventDatesStatus}
        >
          <EventDatesManager
            initialStart={eventStart}
            initialEnd={eventEnd}
          />
        </CollapsibleSection>

        <CollapsibleSection
          panel
          title="Departments"
          summary="Roles grouped by department"
          status={counted(departmentCount ?? 0, 'department')}
        >
          <DepartmentsManager groupIconOptions={groupIconOptions} />
        </CollapsibleSection>

        <CollapsibleSection
          panel
          title="Groups"
          summary="Group collections and the groups within them — plus who's assigned to each"
          status={`${counted(groupCollections.length, 'collection')} · ${counted(totalGroupCount, 'group')}`}
        >
          <GroupsManager members={groupMembers} />
        </CollapsibleSection>

        <CollapsibleSection
          panel
          title="Shift Types"
          summary="The kinds of shift members sign up for (Setup, Service, …)"
          status={counted(shiftTypeOptions.length, 'type')}
        >
          <ShiftTypesManager />
        </CollapsibleSection>

        {/* ═══════════════ ACCESS & SYSTEM ═══════════════ */}
        <CategoryHeading id="system" large />

        <CollapsibleSection
          panel
          title="Admins"
          summary="Grant or remove access to this admin console"
          status={counted(adminCount, 'admin')}
        >
          <AdminsManager members={adminMembers} />
        </CollapsibleSection>

        <CollapsibleSection
          panel
          title="Poll Managers"
          summary="Let members create and edit polls from their dashboard"
          status={pollManagerCount === 0 ? 'none granted' : counted(pollManagerCount, 'member')}
        >
          <PollManagersManager members={adminMembers} />
        </CollapsibleSection>

        <CollapsibleSection
          panel
          title="Debug Tools"
          summary="Testing utilities — for development only"
        >
          <DebugSection />
        </CollapsibleSection>

      </div>
    </div>
  )
}

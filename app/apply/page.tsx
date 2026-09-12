import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getPageContent } from '@/lib/page-content'
import { requireAdmin } from '@/lib/admin-auth'
import { mergeMemberConfig, mergeVolunteerConfig } from '@/lib/form-config'
import { DEFAULT_AGREEMENT_ITEMS, DEFAULT_ATTENDANCE_OPTIONS, parseTrackCopy } from '@/lib/site-config'
import { parseContributionTypes } from '@/lib/application-options'
import { ApplyWizard } from './ApplyWizard'
import { TrackPicker } from './TrackPicker'

export default async function ApplyPage(
  props: { searchParams: Promise<{ track?: string; admin_preview?: string }> }
) {
  const searchParams = await props.searchParams;
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const isAdminPreview = searchParams.admin_preview === '1'

  // currentUser() is a Clerk Backend-API round-trip (needed for the wizard's
  // email prefill) — it runs inside the batch, never on its own line. The
  // admin-preview check rides along via requireAdmin (session claims).
  const [user, adminId, { data: existing }, { data: volunteer }, configMap] = await Promise.all([
    currentUser(),
    isAdminPreview ? requireAdmin() : null,
    db.from('members').select('id, status').eq('clerk_user_id', userId).maybeSingle(),
    db.from('volunteers').select('id, status').eq('clerk_user_id', userId).maybeSingle(),
    getPageContent(community.id, [
      'config_member_form',
      'config_volunteer_form',
      'member_acknowledgements',
      'member_attendance_options',
      'community_contribution_types',
      'config_track_picker',
    ]),
  ])

  const email = user?.emailAddresses[0]?.emailAddress ?? ''
  const isAdmin = !!adminId


  let memberRaw: object = {}
  let volunteerRaw: object = {}
  try { if (configMap['config_member_form']) memberRaw = JSON.parse(configMap['config_member_form']) } catch { /* use defaults */ }
  try { if (configMap['config_volunteer_form']) volunteerRaw = JSON.parse(configMap['config_volunteer_form']) } catch { /* use defaults */ }

  let agreementItems: string[] = DEFAULT_AGREEMENT_ITEMS
  let attendanceOptions: string[] = DEFAULT_ATTENDANCE_OPTIONS
  try { if (configMap['member_acknowledgements']) agreementItems = JSON.parse(configMap['member_acknowledgements']) } catch { /* use defaults */ }
  try { if (configMap['member_attendance_options']) attendanceOptions = JSON.parse(configMap['member_attendance_options']) } catch { /* use defaults */ }
  const contributionTypes = parseContributionTypes(configMap['community_contribution_types'])

  const memberConfig = mergeMemberConfig(memberRaw)
  const volunteerConfig = mergeVolunteerConfig(volunteerRaw)
  const trackCopy = parseTrackCopy(configMap['config_track_picker'])

  const memberOpen = memberConfig.open
  const volunteerOpen = volunteerConfig.open

  // Skip redirect checks for admin previews
  if (!isAdmin) {
    if (existing && existing.status === 'pending') redirect('/profile')
    if (existing && existing.status === 'rejected') redirect('/profile')
    if (existing && existing.status === 'approved') redirect('/participate')
    if (volunteer?.status === 'active') redirect('/profile')
  }

  // Member track
  if (searchParams.track === 'member') {
    if (!memberOpen && !isAdmin) {
      return <ClosedPage message="Camp member applications are not currently open." />
    }
    // All groups — a "Group selection" field (if the admin added one) picks which
    // of these it offers via the field's own config (field.options).
    const { data: selectableGroups } = await db
      .from('groups')
      .select('id, name, description')
      .order('sort_order', { ascending: true })
    return <ApplyWizard userEmail={email} formConfig={memberConfig} agreementItems={agreementItems} attendanceOptions={attendanceOptions} contributionTypes={contributionTypes} selectableGroups={selectableGroups ?? []} />
  }

  // Both closed → generic closed state
  if (!memberOpen && !volunteerOpen && !isAdmin) {
    return <ClosedPage message={`Applications to ${community.name} are not currently open. Check back soon.`} />
  }

  return <TrackPicker hideMember={!memberOpen && !isAdmin} hideVolunteer={!volunteerOpen && !isAdmin} copy={trackCopy} />
}

function ClosedPage({ message }: { message: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: '480px' }}>
        <p style={{ fontFamily: 'TokyoDreams, serif', fontSize: '2.5rem', color: '#C8A848', marginBottom: '0.5rem', textShadow: '0 0 40px rgba(200,168,72,0.4)' }}>✦</p>
        <h1 style={{ fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', color: '#C8A848', marginBottom: '1rem' }}>Applications Closed</h1>
        <p style={{ fontSize: '0.95rem', lineHeight: 1.8, opacity: 0.55, marginBottom: '2rem' }}>{message}</p>
        <a href="/" style={{ padding: '0.75rem 2rem', borderRadius: '9999px', border: '1px solid rgba(200,168,72,0.5)', color: '#C8A848', textDecoration: 'none', fontSize: '0.85rem', letterSpacing: '0.1em' }}>
          ← Return home
        </a>
      </div>
    </div>
  )
}

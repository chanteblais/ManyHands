import { auth, currentUser } from '@clerk/nextjs/server'
import { hasCommunityAdminRole } from '@/lib/admin-auth'
import { redirect } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { getPageContentValue } from '@/lib/page-content'
import { mergeVolunteerConfig } from '@/lib/form-config'
import { VolunteerForm } from './VolunteerForm'

export default async function VolunteerPage(props: { searchParams: Promise<{ admin_preview?: string }> }) {
  const searchParams = await props.searchParams;
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const user = await currentUser()
  const email = user?.emailAddresses[0]?.emailAddress ?? ''
  const firstName = user?.firstName ?? ''
  const lastName = user?.lastName ?? ''

  const isAdminPreview = searchParams.admin_preview === '1'

  let isAdmin = false
  if (isAdminPreview) {
    isAdmin = await hasCommunityAdminRole(community.id, userId)
  }

  const [{ data: existing }, { data: application }, volunteerFormValue] = await Promise.all([
    db.from('volunteers').select('id, status').eq('clerk_user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('members').select('id, status').or(`clerk_user_id.eq.${userId},email.eq.${email}`).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    getPageContentValue(community.id, 'config_volunteer_form'),
  ])

  let volunteerRaw: object = {}
  try { if (volunteerFormValue) volunteerRaw = JSON.parse(volunteerFormValue) } catch { /* use defaults */ }

  const volunteerConfig = mergeVolunteerConfig(volunteerRaw)

  if (!isAdmin) {
    if (existing?.status === 'active') redirect('/profile')
    if (application && application.status !== 'cancelled') redirect('/profile')

    if (!volunteerConfig.open) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '480px' }}>
            <p style={{ fontFamily: 'TokyoDreams, serif', fontSize: '2.5rem', color: '#C8A848', marginBottom: '0.5rem', textShadow: '0 0 40px rgba(200,168,72,0.4)' }}>✦</p>
            <h1 style={{ fontFamily: 'TokyoDreams, serif', fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', color: '#C8A848', marginBottom: '1rem' }}>Volunteer Signup Closed</h1>
            <p style={{ fontSize: '0.95rem', lineHeight: 1.8, opacity: 0.55, marginBottom: '2rem' }}>
              We're not currently accepting new volunteer signups. Check back soon.
            </p>
            <a href="/" style={{ padding: '0.75rem 2rem', borderRadius: '9999px', border: '1px solid rgba(200,168,72,0.5)', color: '#C8A848', textDecoration: 'none', fontSize: '0.85rem', letterSpacing: '0.1em' }}>
              ← Return home
            </a>
          </div>
        </div>
      )
    }
  }

  return (
    <VolunteerForm
      userEmail={email}
      userFirstName={firstName}
      userLastName={lastName}
      formConfig={volunteerConfig}
    />
  )
}

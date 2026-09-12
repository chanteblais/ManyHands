import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { requireAdmin } from '@/lib/admin-auth'
import { getCommunity } from '@/lib/community'
import { mergeMemberConfig, mergeVolunteerConfig } from '@/lib/form-config'
import { parseTrackCopy } from '@/lib/site-config'
import { ApplicationBuilder } from '../ApplicationBuilder'

export default async function ApplicationFormPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  if (!(await requireAdmin())) redirect('/')
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data: configRows } = await db
    .from('page_content')
    .select('key, value')
    .in('key', ['config_member_form', 'config_volunteer_form', 'config_track_picker'])

  const configMap = Object.fromEntries((configRows ?? []).map(r => [r.key, r.value]))

  let memberRaw: object = {}
  let volunteerRaw: object = {}

  try {
    if (configMap['config_member_form']) memberRaw = JSON.parse(configMap['config_member_form'])
  } catch { /* use defaults */ }

  try {
    if (configMap['config_volunteer_form']) volunteerRaw = JSON.parse(configMap['config_volunteer_form'])
  } catch { /* use defaults */ }

  const memberConfig = mergeMemberConfig(memberRaw)
  const volunteerConfig = mergeVolunteerConfig(volunteerRaw)
  const trackCopy = parseTrackCopy(configMap['config_track_picker'])

  return <ApplicationBuilder memberConfig={memberConfig} volunteerConfig={volunteerConfig} trackCopy={trackCopy} />
}

// Dev-only sandbox: renders the real Application Builder with live config but no
// auth gate, so the headless preview browser can verify it. Returns 404 in
// production — never ships a usable bypass.
import { notFound } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { mergeMemberConfig, mergeVolunteerConfig } from '@/lib/form-config'
import { ApplicationBuilder } from '../../admin/configure/ApplicationBuilder'

export default async function DevBuilderPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const { data: configRows } = await db
    .from('page_content')
    .select('key, value')
    .in('key', ['config_member_form', 'config_volunteer_form'])

  const configMap = Object.fromEntries((configRows ?? []).map(r => [r.key, r.value]))

  let memberRaw: object = {}
  let volunteerRaw: object = {}
  try { if (configMap['config_member_form']) memberRaw = JSON.parse(configMap['config_member_form']) } catch { /* defaults */ }
  try { if (configMap['config_volunteer_form']) volunteerRaw = JSON.parse(configMap['config_volunteer_form']) } catch { /* defaults */ }

  const memberConfig = mergeMemberConfig(memberRaw)
  const volunteerConfig = mergeVolunteerConfig(volunteerRaw)

  return <ApplicationBuilder memberConfig={memberConfig} volunteerConfig={volunteerConfig} />
}

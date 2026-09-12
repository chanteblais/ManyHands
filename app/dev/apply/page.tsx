// Dev-only sandbox: renders the real member ApplyWizard with live config but no
// auth gate, so the headless preview browser can verify layout/behavior. Returns
// 404 in production — never ships a usable bypass.
import { notFound } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { mergeMemberConfig } from '@/lib/form-config'
import { DEFAULT_AGREEMENT_ITEMS, DEFAULT_ATTENDANCE_OPTIONS } from '@/lib/site-config'
import { parseContributionTypes } from '@/lib/application-options'
import { ApplyWizard } from '../../apply/ApplyWizard'

export default async function DevApplyPage(props: { searchParams: Promise<{ step?: string }> }) {
  const searchParams = await props.searchParams;
  if (process.env.NODE_ENV === 'production') notFound()
  const community = await getCommunity()
  const db = tenantDb(community.id)

  const initialStep = Number.parseInt(searchParams.step ?? '0', 10) || 0

  const { data: configRows } = await db
    .from('page_content')
    .select('key, value')
    .in('key', ['config_member_form', 'member_acknowledgements', 'member_attendance_options', 'community_contribution_types'])

  const configMap = Object.fromEntries((configRows ?? []).map(r => [r.key, r.value]))

  let memberRaw: object = {}
  try { if (configMap['config_member_form']) memberRaw = JSON.parse(configMap['config_member_form']) } catch { /* defaults */ }

  let agreementItems: string[] = DEFAULT_AGREEMENT_ITEMS
  let attendanceOptions: string[] = DEFAULT_ATTENDANCE_OPTIONS
  try { if (configMap['member_acknowledgements']) agreementItems = JSON.parse(configMap['member_acknowledgements']) } catch { /* defaults */ }
  try { if (configMap['member_attendance_options']) attendanceOptions = JSON.parse(configMap['member_attendance_options']) } catch { /* defaults */ }

  const memberConfig = mergeMemberConfig(memberRaw)
  const contributionTypes = parseContributionTypes(configMap['community_contribution_types'])

  return (
    <ApplyWizard
      userEmail="preview@glaum.camp"
      formConfig={memberConfig}
      agreementItems={agreementItems}
      attendanceOptions={attendanceOptions}
      contributionTypes={contributionTypes}
      initialStep={initialStep}
    />
  )
}

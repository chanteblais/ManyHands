// Dev-only sandbox: renders the apply-page TrackPicker with live config. 404 in
// production.
import { notFound } from 'next/navigation'
import { tenantDb } from '@/lib/tenant-db'
import { getCommunity } from '@/lib/community'
import { parseTrackCopy } from '@/lib/site-config'
import { TrackPicker } from '../../apply/TrackPicker'

export default async function DevPickerPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  const community = await getCommunity()
  const db = tenantDb(community.id)
  const { data } = await db
    .from('page_content').select('value').eq('key', 'config_track_picker').maybeSingle()
  return <TrackPicker copy={parseTrackCopy(data?.value)} />
}

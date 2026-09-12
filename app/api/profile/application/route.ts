import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'
import { EDITABLE_APPLICATION_FIELDS } from '@/lib/application-options'
import {
  canEditApplication,
  getOwnedApplication,
} from '@/lib/profile-auth'
import { formatFieldLabel, notifyAdmin, summarizeChanges } from '@/lib/notify-admin'
import { upsertMember } from '@/lib/members'

export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const community = await getCommunity()
  const db = tenantDb(community.id)

  const user = await currentUser()
  const email = user?.emailAddresses[0]?.emailAddress
  const application = await getOwnedApplication(community.id, userId, email)

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  if (!canEditApplication(application)) {
    return NextResponse.json({ error: 'This application cannot be edited' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  for (const field of EDITABLE_APPLICATION_FIELDS) {
    if (field in body) {
      const value = body[field]
      updates[field] = typeof value === 'string' ? value.trim() || null : value ?? null
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  }

  if ('phone' in updates && !updates.phone) {
    return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
  }

  const changes = summarizeChanges(
    application,
    { ...application, ...updates },
    Object.keys(updates)
  )

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ success: true, unchanged: true })
  }

  const { data, error } = await db
    .from('applications')
    .update({
      ...updates,
      profile_updated_at: new Date().toISOString(),
    })
    .eq('id', application.id)
    .select('*')
    .single()

  if (error) {
    console.error('[profile/application PATCH]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Phase 1 dual-write: mirror identity edits onto the canonical member record.
  const identityKeys = ['first_name', 'last_name', 'preferred_name', 'pronouns', 'phone', 'email'] as const
  const identityPatch: Record<string, unknown> = {}
  for (const k of identityKeys) if (k in updates) identityPatch[k] = updates[k]
  if (Object.keys(identityPatch).length > 0) {
    await upsertMember(community.id, userId, { ...identityPatch, application_id: application.id as string })
  }

  const displayName =
    (application.preferred_name as string) ||
    (application.first_name as string) ||
    'Camper'

  const changedLabels = Object.keys(changes).map(formatFieldLabel).join(', ')

  await notifyAdmin(community, {
    applicationId: application.id,
    eventType: 'profile_updated',
    message: `${displayName} updated their profile (${changedLabels})`,
    details: {
      email: application.email,
      changes,
    },
  })

  return NextResponse.json({ success: true, application: data })
}

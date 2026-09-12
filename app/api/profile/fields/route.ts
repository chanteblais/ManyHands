import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { getCommunity } from '@/lib/community'
import { getPageContentValue } from '@/lib/page-content'
import { resolveMember, getMemberProfileValues, setProfileValues } from '@/lib/members'
import { parseProfileFields, storedFields, coerceProfileValue, DISMISSED_KEY, type ProfileField } from '@/lib/profile-fields'

// Member-facing read/write of registry-defined profile fields
// (member_profiles.values). Phase 4 of profile-as-source-of-truth.
//   GET   → { fields, values } the current member may see or edit.
//   PATCH → write values for memberEditable fields (validated against the registry).

async function loadStoredFields(communityId: string): Promise<ProfileField[]> {
  return storedFields(parseProfileFields(await getPageContentValue(communityId, 'config_profile_fields')))
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()

  const user = await currentUser()
  const email = user?.emailAddresses[0]?.emailAddress
  const member = await resolveMember(community.id, userId, email)
  const values = member ? await getMemberProfileValues(community.id, member.id) : {}

  // Only expose fields the member can actually see (public) or edit.
  const fields = (await loadStoredFields(community.id)).filter(f => f.public || f.memberEditable)
  return NextResponse.json({ fields, values })
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const community = await getCommunity()

  const user = await currentUser()
  const email = user?.emailAddresses[0]?.emailAddress
  const member = await resolveMember(community.id, userId, email)
  if (!member) return NextResponse.json({ error: 'No member profile found' }, { status: 404 })

  const body = (await req.json()) as Record<string, unknown>
  const stored = await loadStoredFields(community.id)
  const editable = new Map(stored.filter(f => f.memberEditable).map(f => [f.key, f]))

  const updates: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(body)) {
    if (key.startsWith('__')) continue // reserved control keys handled below
    const field = editable.get(key)
    if (!field) continue // ignore unknown / non-editable keys
    updates[key] = coerceProfileValue(field, raw)
  }

  // Catch-up dismissal (Phase 4.5): record which optional prompts the member
  // chose "Not now" on. Required prompts can't be dismissed, so ignore those.
  const dismiss = body[DISMISSED_KEY] ?? body.__dismiss
  if (dismiss != null) {
    const requestedRaw = Array.isArray(dismiss) ? dismiss : [dismiss]
    const requested = requestedRaw
      .map(String)
      .filter(k => { const f = editable.get(k); return f && f.askExisting && !f.required })
    if (requested.length) {
      const current = await getMemberProfileValues(community.id, member.id)
      const prev = Array.isArray(current[DISMISSED_KEY]) ? (current[DISMISSED_KEY] as unknown[]).map(String) : []
      updates[DISMISSED_KEY] = Array.from(new Set([...prev, ...requested]))
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
  }

  await setProfileValues(community.id, member.id, updates)
  return NextResponse.json({ success: true })
}

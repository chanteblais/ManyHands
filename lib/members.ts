// Canonical member record helpers (Phase 1 of profile-as-source-of-truth).
//
// `members` is the identity record; `member_profiles.values` is the configurable
// profile JSONB keyed by registry field key (lib/profile-fields.ts). During the
// migration the app DUAL-WRITES here while still reading from `applications`, so
// every function below is GUARDED: a missing table or any error logs and returns
// a benign value rather than throwing — a failure must never break the primary
// application/profile flow. See docs/profile-architecture.md.

import { cache } from 'react'
import { currentUser } from '@clerk/nextjs/server'
import { tenantDb } from './tenant-db'

export type MemberRecord = {
  id: string
  clerk_user_id: string | null
  email: string | null
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  pronouns: string | null
  phone: string | null
  avatar_url: string | null
  status: string | null
  application_id: string | null
  // Suspension (migration 063) — orthogonal to status: a suspended member is
  // still 'approved' (keeps full read access) but holds no group/shift
  // commitments and can't take new ones until the suspension is lifted.
  suspended_at: string | null
  suspended_by: string | null
  suspension_note: string | null
  // Camp dues (migration 067) — non-NULL `dues_paid_at` = dues recorded paid.
  // Collected manually this year; `dues_note` holds amount/method free text.
  // `dues_reported_at` (068) = the member's self-reported (unconfirmed) claim.
  dues_paid_at: string | null
  dues_paid_by: string | null
  dues_note: string | null
  dues_reported_at: string | null
  // Community-scoped permissions (migration 074, read since branch 1d):
  // 'admin' administers this community; can_manage_polls grants the poll manager.
  role: 'member' | 'admin'
  can_manage_polls: boolean
}

const MEMBER_COLUMNS =
  'id, clerk_user_id, email, first_name, last_name, preferred_name, pronouns, phone, avatar_url, status, application_id, suspended_at, suspended_by, suspension_note, dues_paid_at, dues_paid_by, dues_note, dues_reported_at, role, can_manage_polls'

export type MemberIdentity = Partial<Omit<MemberRecord, 'id' | 'clerk_user_id'>>

/**
 * Find a member by clerk_user_id (preferred), falling back to email.
 * Request-cached (React cache): the Header and the page it sits on share one
 * lookup per render instead of querying twice.
 */
export const resolveMember = cache(async function resolveMember(
  communityId: string,
  clerkUserId: string | null,
  email?: string | null,
): Promise<MemberRecord | null> {
  const db = tenantDb(communityId)
  try {
    if (clerkUserId) {
      const { data } = await db
        .from('members').select(MEMBER_COLUMNS)
        .eq('clerk_user_id', clerkUserId).maybeSingle()
      if (data) return data as MemberRecord
    }
    if (email) {
      const { data } = await db
        .from('members').select(MEMBER_COLUMNS)
        .ilike('email', email).maybeSingle()
      if (data) return data as MemberRecord
    }
  } catch (e) {
    console.error('[members] resolveMember failed', e)
  }
  return null
})

/**
 * Resolve the signed-in user's member row without a Clerk Backend-API
 * round-trip on the common path. Every production row has clerk_user_id set,
 * so the indexed lookup almost always hits; `currentUser()` (a ~200–500ms
 * network call to Clerk) runs only as the email fallback for rows that were
 * never linked. Found-by-email rows get clerk_user_id backfilled so the next
 * request takes the fast path.
 */
export async function resolveMemberForUser(communityId: string, clerkUserId: string): Promise<MemberRecord | null> {
  const direct = await resolveMember(communityId, clerkUserId)
  if (direct) return direct

  const user = await currentUser()
  const email = user?.emailAddresses[0]?.emailAddress
  if (!email) return null

  const byEmail = await resolveMember(communityId, null, email)
  if (byEmail && !byEmail.clerk_user_id) {
    const { error } = await tenantDb(communityId)
      .from('members')
      .update({ clerk_user_id: clerkUserId })
      .eq('id', byEmail.id)
      .is('clerk_user_id', null)
    if (error) console.error('[members] clerk_user_id backfill', error)
  }
  return byEmail
}

/** resolveMemberForUser gated on approved status — the standard API-route auth check. */
export async function getApprovedMember(communityId: string, clerkUserId: string): Promise<MemberRecord | null> {
  const member = await resolveMemberForUser(communityId, clerkUserId)
  return member?.status === 'approved' ? member : null
}

export type VolunteerRecord = {
  id: string
  clerk_user_id: string | null
  email: string | null
  first_name: string | null
  last_name: string | null
  preferred_name: string | null
  status: string | null
}

/**
 * The signed-in user's ACTIVE volunteer row (volunteers sign in with Clerk like
 * members do, so the indexed clerk_user_id lookup is the only path — a volunteer
 * without a linked account can't be signed in here). Pending/cancelled/removed
 * volunteers return null: shift self-serve is an active-volunteer ability, the
 * same bar the rest of the app uses (directory, dues, own-profile commitments).
 */
export async function getActiveVolunteer(communityId: string, clerkUserId: string): Promise<VolunteerRecord | null> {
  try {
    const { data } = await tenantDb(communityId)
      .from('volunteers')
      .select('id, clerk_user_id, email, first_name, last_name, preferred_name, status')
      .eq('clerk_user_id', clerkUserId)
      .eq('status', 'active')
      .maybeSingle()
    return (data as VolunteerRecord | null) ?? null
  } catch (e) {
    console.error('[members] getActiveVolunteer failed', e)
    return null
  }
}

// Who may hold shifts: an approved member or an active volunteer. Volunteers
// exist to take shifts — the signup surfaces gate on this, not on membership.
export type ShiftParticipant =
  | { kind: 'member'; member: MemberRecord }
  | { kind: 'volunteer'; volunteer: VolunteerRecord }

/**
 * Resolve the signed-in user as a shift participant: approved member first
 * (members who also have a stale volunteer row count as members), else active
 * volunteer, else null.
 */
export async function getShiftParticipant(communityId: string, clerkUserId: string): Promise<ShiftParticipant | null> {
  // Both lookups key on clerk_user_id and member wins — run them in parallel
  // (this sits on the hot path of every shift-signup request).
  const [member, volunteer] = await Promise.all([
    getApprovedMember(communityId, clerkUserId),
    getActiveVolunteer(communityId, clerkUserId),
  ])
  if (member) return { kind: 'member', member }
  return volunteer ? { kind: 'volunteer', volunteer } : null
}

/** Display name for either kind of participant (mirrors memberDisplayName). */
export function participantDisplayName(p: ShiftParticipant, fallback: string): string {
  if (p.kind === 'member') return memberDisplayName(p.member, fallback)
  const v = p.volunteer
  if (v.preferred_name) return v.preferred_name
  if (v.first_name && v.last_name) return `${v.first_name} ${v.last_name}`
  return v.first_name ?? fallback
}

/** Human-readable name for notifications: preferred, else "First Last", else the fallback. */
export function memberDisplayName(member: MemberRecord, fallback: string): string {
  if (member.preferred_name) return member.preferred_name
  if (member.first_name && member.last_name) return `${member.first_name} ${member.last_name}`
  return member.first_name ?? fallback
}

/** The member's stored profile values (empty object when none). */
export async function getMemberProfileValues(communityId: string, memberId: string): Promise<Record<string, unknown>> {
  try {
    const { data } = await tenantDb(communityId)
      .from('member_profiles').select('values')
      .eq('member_id', memberId).maybeSingle()
    return (data?.values as Record<string, unknown>) ?? {}
  } catch (e) {
    console.error('[members] getMemberProfileValues failed', e)
    return {}
  }
}

/** Merge partial values into member_profiles.values (read-modify-write). */
export async function setProfileValues(
  communityId: string,
  memberId: string,
  partial: Record<string, unknown>,
): Promise<void> {
  try {
    const current = await getMemberProfileValues(communityId, memberId)
    const next = { ...current, ...partial }
    const { error } = await tenantDb(communityId)
      .from('member_profiles')
      .upsert([{ member_id: memberId, values: next, updated_at: new Date().toISOString() }], { onConflict: 'member_id' })
    if (error) console.error('[members] setProfileValues', error)
  } catch (e) {
    console.error('[members] setProfileValues failed', e)
  }
}

/**
 * Upsert a member (matched by clerk_user_id, else email), patching identity and
 * linking the clerk id if not yet set. Optionally seeds profile values. Returns
 * the member id, or null on failure. Guaranteed not to throw.
 *
 * Pass `{ updateOnly: true }` to mirror onto an EXISTING member only — no row is
 * inserted when none matches, and the call returns null. Use this for writers
 * that carry no identity (e.g. the avatar dual-write): inserting from them would
 * create a nameless, emailless phantom `members` row for every signed-in
 * non-member (volunteers, browsers). Members are created only where identity is
 * present — apply / approve / profile-edit.
 */
export async function upsertMember(
  communityId: string,
  clerkUserId: string | null,
  identity: MemberIdentity,
  profileValues?: Record<string, unknown>,
  options?: { updateOnly?: boolean },
): Promise<string | null> {
  const db = tenantDb(communityId)
  try {
    const existing = await resolveMember(communityId, clerkUserId, identity.email ?? null)
    let memberId: string | null = existing?.id ?? null

    if (!memberId && options?.updateOnly) return null

    if (memberId) {
      const patch: Record<string, unknown> = { ...identity, updated_at: new Date().toISOString() }
      if (clerkUserId && !existing?.clerk_user_id) patch.clerk_user_id = clerkUserId
      const { error } = await db.from('members').update(patch).eq('id', memberId)
      if (error) { console.error('[members] update', error); return null }
    } else {
      const { data, error } = await db
        .from('members')
        .insert([{ clerk_user_id: clerkUserId, ...identity }])
        .select('id').single()
      if (error || !data) { console.error('[members] insert', error); return null }
      memberId = data.id as string
    }

    if (profileValues && Object.keys(profileValues).length > 0) {
      await setProfileValues(communityId, memberId, profileValues)
    } else {
      // Ensure a profile row exists even when there are no values yet.
      await db
        .from('member_profiles')
        .upsert([{ member_id: memberId }], { onConflict: 'member_id', ignoreDuplicates: true })
    }
    return memberId
  } catch (e) {
    console.error('[members] upsertMember failed', e)
    return null
  }
}

/**
 * Mirror a status change onto the member record (matched by application_id, else
 * clerk_user_id). Used by the approve/reject/cancel flows during dual-write.
 */
export async function setMemberStatus(
  communityId: string,
  clerkUserId: string | null,
  applicationId: string | null,
  status: string,
): Promise<void> {
  const db = tenantDb(communityId)
  try {
    const stamp = new Date().toISOString()
    if (applicationId) {
      const { error, count } = await db
        .from('members').update({ status, updated_at: stamp }, { count: 'exact' })
        .eq('application_id', applicationId)
      if (!error && (count ?? 0) > 0) return
    }
    if (clerkUserId) {
      await db
        .from('members').update({ status, updated_at: stamp })
        .eq('clerk_user_id', clerkUserId)
    }
  } catch (e) {
    console.error('[members] setMemberStatus failed', e)
  }
}

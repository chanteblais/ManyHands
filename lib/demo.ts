import fs from 'node:fs'
import path from 'node:path'
import { clerkClient } from '@clerk/nextjs/server'
import type { Community } from '@/lib/community'
import { objectPath, tenantDb } from '@/lib/tenant-db'

// The open demo (docs/features.md → Demo guest access). A community whose
// `settings.demo` is true (set by scripts/seed-demo — Lantern Hollow) lets
// anyone in as an organizer without an account of their own:
//
//   • "Explore as an organizer" (components/DemoBanner.tsx) → POST
//     /api/demo/enter mints a THROWAWAY Clerk user + an approved admin member
//     row in that community, and hands back a sign-in ticket.
//   • Nothing leaves the building: lib/send-email.ts and lib/notify.ts drop
//     every email / push for a demo community.
//   • /api/cron/demo-reset reseeds the community nightly and deletes the guest
//     Clerk users, so each visitor's edits live for a day at most.
//
// Admin in the demo is a members.role fact scoped to the demo community
// (lib/admin-auth.ts), so a guest has no reach into any other community.

export function isDemoCommunity(community: Pick<Community, 'settings'>): boolean {
  return community.settings?.demo === true
}

// Guests are recognisable by email (Clerk requires one on this instance):
// `demo-guest-<id>@example.com` — a reserved domain, so nothing is ever
// deliverable even if a send slipped through — plus a publicMetadata marker.
const GUEST_EMAIL_PREFIX = 'demo-guest-'
const GUEST_EMAIL_DOMAIN = 'example.com'
const GUEST_MARKER = 'demoGuest'
// applications.phone is NOT NULL; 555-01xx is the reserved fictional range.
const GUEST_PHONE = '+1 555 0100 0000'

// Ceiling on guests minted per community per day — a scripted loop against
// /api/demo/enter can't fill the Clerk instance with users.
export const DEMO_GUEST_DAILY_CAP = 150

export function isDemoGuestEmail(email: string | null | undefined): boolean {
  return !!email && email.startsWith(GUEST_EMAIL_PREFIX) && email.endsWith(`@${GUEST_EMAIL_DOMAIN}`)
}

/** Guests this community minted in the last 24 hours. */
export async function recentDemoGuestCount(communityId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error } = await tenantDb(communityId)
    .from('members')
    .select('id', { count: 'exact', head: true })
    .like('email', `${GUEST_EMAIL_PREFIX}%@${GUEST_EMAIL_DOMAIN}`)
    .gte('created_at', since)
  if (error) throw new Error(`[demo] guest count failed: ${error.message}`)
  return count ?? 0
}

// Guests get a random portrait from a small pool of AI-generated fictional
// visitors, committed beside the seeded members' (next.config.js traces the
// folder into /api/demo/enter). The copy lands in the guest's own avatar slot,
// which the nightly reset clears with the rest of the demo's avatars.
const GUEST_AVATAR_DIR = 'scripts/seed-demo/guest-avatars'

async function uploadGuestAvatar(db: ReturnType<typeof tenantDb>, communityId: string, userId: string): Promise<string | null> {
  try {
    const dir = path.join(/* turbopackIgnore: true */ process.cwd(), GUEST_AVATAR_DIR)
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.webp'))
    if (!files.length) return null
    const file = files[Math.floor(Math.random() * files.length)]
    const p = objectPath(communityId, `${userId}/avatar.webp`)
    const { error } = await db.storage.from('avatars').upload(p, fs.readFileSync(path.join(dir, file)), { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
    if (error) throw error
    return db.storage.from('avatars').getPublicUrl(p).data.publicUrl
  } catch (e) {
    // A portrait is a nicety — never block the way in over it.
    console.error('[demo] guest avatar failed', e)
    return null
  }
}

/**
 * Mint one guest: a throwaway Clerk user, an approved application + admin
 * member row in the demo community, and a short-lived sign-in ticket the
 * browser redeems (`signIn.create({ strategy: 'ticket' })`).
 */
export async function createDemoGuest(community: Community): Promise<{ userId: string; ticket: string }> {
  if (!isDemoCommunity(community)) throw new Error('[demo] not a demo community')
  const tag = crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  const email = `${GUEST_EMAIL_PREFIX}${tag}@${GUEST_EMAIL_DOMAIN}`
  const client = await clerkClient()
  const user = await client.users.createUser({
    firstName: 'Guest',
    lastName: 'Organizer',
    emailAddress: [email],
    skipPasswordRequirement: true,
    publicMetadata: { [GUEST_MARKER]: true, demoCommunityId: community.id },
  })

  try {
    const db = tenantDb(community.id)
    const now = new Date().toISOString()
    const avatarUrl = await uploadGuestAvatar(db, community.id, user.id)
    const { data: app, error: appErr } = await db
      .from('applications')
      .insert({
        clerk_user_id: user.id, first_name: 'Guest', last_name: 'Organizer', email, phone: GUEST_PHONE,
        status: 'approved', submitted_at: now, reviewed_at: now, avatar_url: avatarUrl,
        public_bio: 'Visiting the hollow to see how it all works.',
      })
      .select('id')
      .single()
    if (appErr) throw new Error(`applications: ${appErr.message}`)
    const { error: memErr } = await db.from('members').insert({
      clerk_user_id: user.id, application_id: app.id, first_name: 'Guest', last_name: 'Organizer',
      email, phone: GUEST_PHONE, avatar_url: avatarUrl, status: 'approved', role: 'admin',
    })
    if (memErr) throw new Error(`members: ${memErr.message}`)
  } catch (e) {
    // Don't strand a Clerk user with no member row behind it.
    await client.users.deleteUser(user.id).catch(() => {})
    throw e
  }

  const token = await client.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 300 })
  return { userId: user.id, ticket: token.token }
}

/** Delete every guest Clerk user (nightly, from the reset cron). Returns how many went. */
export async function deleteDemoGuestUsers(): Promise<number> {
  const client = await clerkClient()
  let deleted = 0
  // Deleting shrinks the result set, so always re-read the first page.
  for (let round = 0; round < 50; round++) {
    const { data } = await client.users.getUserList({ query: GUEST_EMAIL_PREFIX, limit: 100 })
    const guests = data.filter(
      u => u.publicMetadata?.[GUEST_MARKER] === true && u.emailAddresses.some(e => isDemoGuestEmail(e.emailAddress)),
    )
    if (!guests.length) break
    for (const u of guests) {
      await client.users.deleteUser(u.id)
      deleted++
    }
  }
  return deleted
}

import { unstable_cache } from 'next/cache'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { SITE_NAME, EVENT_NAME, SITE_DESCRIPTION } from '@/lib/site-config'
import { isPlatformHost, platformHosts, PLATFORM_NAME } from '@/lib/platform'

// Tenant resolution (docs/tenancy-design.md §2). Every server render and API
// route resolves the current community ONCE from the request host and passes
// `community.id` down into the data layer (`lib/tenant-db.ts`). This file and
// tenant-db.ts are the only places that may touch `supabaseAdmin` directly for
// the `communities` table.
//
// Resolution order: request host (x-forwarded-host, then host; with port,
// then without) → DEFAULT_COMMUNITY_SLUG (env; 'glaum') → CommunityNotFound.
// The default covers localhost, preview URLs and the single-host era; once a
// platform root host exists, an unresolved host renders the picker instead.

export type CommunityStatus = 'active' | 'paused' | 'archived'

export type Community = {
  id: string
  slug: string
  name: string
  description: string | null
  hosts: string[]
  timezone: string
  eventName: string | null
  emailFrom: string | null
  theme: Record<string, unknown>
  settings: Record<string, unknown>
  status: CommunityStatus
}

/** The subset safe to ship to client components (no sender/config internals). */
export type PublicCommunity = Pick<Community, 'id' | 'slug' | 'name' | 'eventName' | 'theme'>

export const COMMUNITIES_TAG = 'communities'
export const DEFAULT_COMMUNITY_SLUG = process.env.DEFAULT_COMMUNITY_SLUG || 'glaum'

export class CommunityNotFoundError extends Error {
  constructor(public readonly host: string) {
    super(`No community resolves for host "${host}" and no default community exists`)
    this.name = 'CommunityNotFoundError'
  }
}

type CommunityRow = {
  id: string
  slug: string
  name: string
  description: string | null
  hosts: string[] | null
  timezone: string | null
  event_name: string | null
  email_from: string | null
  theme: unknown
  settings: unknown
  status: string | null
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function rowToCommunity(r: CommunityRow): Community {
  const status: CommunityStatus =
    r.status === 'paused' || r.status === 'archived' ? r.status : 'active'
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    hosts: (r.hosts ?? []).map(h => h.toLowerCase()),
    timezone: r.timezone || 'UTC',
    eventName: r.event_name,
    emailFrom: r.email_from,
    theme: asObject(r.theme),
    settings: asObject(r.settings),
    status,
  }
}

// The table is tiny and changes rarely: cache the whole thing, resolve in
// memory. Errors are thrown (never cached) so a pre-migration deployment
// falls through to the synthetic default below on every request instead of
// pinning it in the cache.
const fetchAllCommunities = unstable_cache(
  async (): Promise<Community[]> => {
    const { data, error } = await supabaseAdmin
      .from('communities')
      .select('id, slug, name, description, hosts, timezone, event_name, email_from, theme, settings, status')
      .order('created_at', { ascending: true })
    if (error) throw new Error(`[community] read failed: ${error.message}`)
    return (data as CommunityRow[]).map(rowToCommunity)
  },
  ['communities-all'],
  { tags: [COMMUNITIES_TAG], revalidate: 300 },
)

// Pre-migration-074 safety net: the layout resolves the community on every
// request, so a deploy that lands before the migration must degrade, not 500.
// Identified by the all-zero id so nothing downstream mistakes it for a row.
export const FALLBACK_COMMUNITY_ID = '00000000-0000-0000-0000-000000000000'
let warnedFallback = false
function fallbackCommunity(): Community {
  if (!warnedFallback) {
    warnedFallback = true
    console.warn('[community] `communities` table unavailable — serving the synthetic default community. Apply migration 074.')
  }
  return {
    id: FALLBACK_COMMUNITY_ID,
    slug: DEFAULT_COMMUNITY_SLUG,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    hosts: [],
    timezone: 'UTC',
    eventName: EVENT_NAME,
    emailFrom: null,
    theme: {},
    settings: {},
    status: 'active',
  }
}

// The platform host (docs/domains.md) is not a community: it serves the
// picker and the auth pages only. Requests there resolve to this pseudo-
// community so the layout, header and auth pages render; every scoped query
// against its all-zero id returns nothing.
export const PLATFORM_COMMUNITY_SLUG = 'platform'
function platformCommunity(): Community {
  return {
    id: FALLBACK_COMMUNITY_ID, slug: PLATFORM_COMMUNITY_SLUG, name: PLATFORM_NAME, description: null,
    hosts: platformHosts(), timezone: 'UTC', eventName: null, emailFrom: null, theme: {}, settings: {}, status: 'active',
  }
}
export function isPlatformCommunity(c: Pick<Community, 'slug'>): boolean {
  return c.slug === PLATFORM_COMMUNITY_SLUG
}

/** All communities (cached). Falls back to the synthetic default when the table is missing. */
export async function listCommunities(): Promise<Community[]> {
  try {
    return await fetchAllCommunities()
  } catch {
    return [fallbackCommunity()]
  }
}

function requestHost(headerList: Headers): string {
  const forwarded = headerList.get('x-forwarded-host')?.split(',')[0]?.trim()
  return (forwarded || headerList.get('host') || '').toLowerCase()
}

/** Resolve a community from a request host: exact host:port first, then hostname only. */
export function resolveCommunityForHost(all: Community[], host: string): Community | null {
  const full = host.toLowerCase()
  const bare = full.split(':')[0]
  return (
    all.find(c => c.hosts.includes(full)) ??
    all.find(c => c.hosts.includes(bare)) ??
    all.find(c => c.slug === DEFAULT_COMMUNITY_SLUG) ??
    null
  )
}

/**
 * The community for the current request. Server-only (reads request headers).
 * Call once per render/route and pass `community.id` into the data layer.
 */
export async function getCommunity(): Promise<Community> {
  const host = requestHost(await headers())
  if (isPlatformHost(host)) return platformCommunity()
  const community = resolveCommunityForHost(await listCommunities(), host)
  if (!community) throw new CommunityNotFoundError(host)
  return community
}

export async function getCommunityBySlug(slug: string): Promise<Community | null> {
  return (await listCommunities()).find(c => c.slug === slug) ?? null
}

/** Communities a person belongs to (any member status) — feeds the app switcher / web picker. */
export async function listCommunitiesForUser(
  clerkUserId: string,
): Promise<Array<{ community: Community; status: string; role: string }>> {
  const all = await listCommunities()
  if (all.length === 1 && all[0].id === FALLBACK_COMMUNITY_ID) return []
  const { data, error } = await supabaseAdmin
    .from('members')
    .select('community_id, status, role')
    .eq('clerk_user_id', clerkUserId)
  if (error) throw new Error(`[community] membership read failed: ${error.message}`)
  const byId = new Map(all.map(c => [c.id, c]))
  const out: Array<{ community: Community; status: string; role: string }> = []
  for (const row of data ?? []) {
    const community = byId.get(row.community_id as string)
    if (community && community.status !== 'archived') {
      out.push({ community, status: String(row.status ?? ''), role: String(row.role ?? 'member') })
    }
  }
  return out
}

/**
 * Origins a sign-in/sign-up may return to: the platform hosts and every
 * community host (https). Used by the auth pages on the primary host, which
 * receive satellite return URLs.
 */
export async function isKnownOrigin(origin: string): Promise<boolean> {
  let host: string
  try { const u = new URL(origin); if (u.protocol !== 'https:' && u.protocol !== 'http:') return false; host = u.host.toLowerCase() } catch { return false }
  if (platformHosts().includes(host) || platformHosts().includes(host.split(':')[0])) return true
  const all = await listCommunities()
  return all.some(c => c.hosts.includes(host) || c.hosts.includes(host.split(':')[0]))
}

export function toPublicCommunity(c: Community): PublicCommunity {
  return { id: c.id, slug: c.slug, name: c.name, eventName: c.eventName, theme: c.theme }
}

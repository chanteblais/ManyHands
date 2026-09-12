import { listCommunities, isPlatformCommunity, type Community } from '@/lib/community'
import { appOrigin } from '@/lib/send-email'

// The public community directory shown on the platform host (docs/domains.md,
// docs/features.md → Communities picker): every ACTIVE community that hasn't
// opted out (`communities.settings.discoverable === false`). Names and
// descriptions only — whether a community is taking applications is theirs
// to say on their own page, not advertised here (decided 2026-09-12).

export type DirectoryEntry = {
  slug: string
  name: string
  description: string | null
  eventName: string | null
  origin: string
}

export function isDiscoverable(c: Community): boolean {
  return c.status === 'active' && !isPlatformCommunity(c) && c.settings.discoverable !== false && c.hosts.length > 0
}

export async function listDiscoverableCommunities(): Promise<DirectoryEntry[]> {
  return (await listCommunities())
    .filter(isDiscoverable)
    .map(c => ({ slug: c.slug, name: c.name, description: c.description, eventName: c.eventName, origin: appOrigin(c) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

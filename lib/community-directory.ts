import { listCommunities, type Community } from '@/lib/community'
import { getPageContentValue } from '@/lib/page-content'
import { appOrigin } from '@/lib/send-email'
import { isPlatformCommunity } from '@/lib/community'

// The public community directory shown on the platform host (docs/domains.md,
// docs/features.md → Communities picker): every ACTIVE community that hasn't
// opted out (`communities.settings.discoverable === false`), with whether its
// member application is currently open (`page_content.config_member_form.open`,
// the same switch the Application Builder toggles). Public data only.

export type DirectoryEntry = {
  slug: string
  name: string
  description: string | null
  eventName: string | null
  origin: string
  applicationsOpen: boolean
}

function applicationsOpenFrom(raw: string | null): boolean {
  if (!raw) return true // no saved config → the default member form, which is open
  try {
    const parsed = JSON.parse(raw) as { open?: unknown }
    return parsed.open === undefined ? true : parsed.open === true
  } catch {
    return true
  }
}

export function isDiscoverable(c: Community): boolean {
  return c.status === 'active' && !isPlatformCommunity(c) && c.settings.discoverable !== false && c.hosts.length > 0
}

export async function listDiscoverableCommunities(): Promise<DirectoryEntry[]> {
  const all = (await listCommunities()).filter(isDiscoverable)
  const entries = await Promise.all(all.map(async c => ({
    slug: c.slug,
    name: c.name,
    description: c.description,
    eventName: c.eventName,
    origin: appOrigin(c),
    applicationsOpen: applicationsOpenFrom(await getPageContentValue(c.id, 'config_member_form').catch(() => null)),
  })))
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

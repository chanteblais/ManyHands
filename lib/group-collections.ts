import { tenantDb } from './tenant-db'

// Group Collections — the configurable container above leaf `groups` (see
// migration 042 + lib/groups.ts). An organizer names a collection ("Contributions",
// "Volunteer Teams", "Committees", "Guilds") and defines the selectable groups
// beneath it. The platform knows nothing about "Setup" — only that a collection
// holds groups. `selection` controls how many child groups a member may hold
// within one collection ('multi' = several, 'single' = exactly one).

export type SelectionMode = 'single' | 'multi'

export type GroupCollection = {
  id: string
  name: string
  description: string | null
  selection: SelectionMode
  /** Whether members' groups in this collection appear on their profile. */
  show_on_profile: boolean
  /** Whether members may self-join this collection's groups on the Participate page. */
  self_join: boolean
  sort_order: number
}

// A collection together with its child groups (leaves), ordered. Used by the
// admin manager and any surface that presents groups grouped by collection.
export type GroupCollectionWithGroups = GroupCollection & {
  groups: {
    id: string
    name: string
    icon: string | null
    icon_image: string | null
    description: string | null
    apply_selectable: boolean
    sort_order: number
  }[]
}

// Fetch every collection with its groups nested and ordered. Groups whose
// `collection_id` is null (shouldn't happen post-backfill, but possible if a
// collection was deleted with ON DELETE SET NULL) are returned under a synthetic
// `uncollected` bucket so the admin can always see and re-home them.
export async function getGroupCollections(communityId: string): Promise<{
  collections: GroupCollectionWithGroups[]
  uncollected: GroupCollectionWithGroups['groups']
}> {
  const db = tenantDb(communityId)
  const [{ data: collections }, { data: groups }] = await Promise.all([
    db
      .from('group_collections')
      .select('id, name, description, selection, show_on_profile, self_join, sort_order')
      .order('sort_order', { ascending: true }),
    db
      .from('groups')
      .select('id, name, icon, icon_image, description, apply_selectable, sort_order, collection_id')
      .order('sort_order', { ascending: true }),
  ])

  const byCollection: Record<string, GroupCollectionWithGroups['groups']> = {}
  const uncollected: GroupCollectionWithGroups['groups'] = []
  for (const g of groups ?? []) {
    const { collection_id, ...rest } = g
    if (collection_id) (byCollection[collection_id] ??= []).push(rest)
    else uncollected.push(rest)
  }

  return {
    collections: (collections ?? []).map(c => ({
      ...(c as GroupCollection),
      groups: byCollection[c.id] ?? [],
    })),
    uncollected,
  }
}

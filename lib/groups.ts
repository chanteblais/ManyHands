import { tenantDb } from './tenant-db'

export type MemberGroup = {
  id: string
  name: string
  icon: string | null
  description: string | null
  icon_image: string | null
  // The group's collection (migration 042). Null only for orphaned groups.
  collectionId: string | null
  collectionName: string | null
  collectionSort: number
  // Whether this group's collection is shown on the member's profile. Groups
  // with no collection default to visible. Governs profile DISPLAY only — facts,
  // attunement, schedule and rosters always see full membership.
  showOnProfile: boolean
}

// Fetch the groups a member belongs to (ordered by the group's sort_order).
// Replaces the old `setup_preference`-derived "contributions" concept.
export async function getMemberGroups(communityId: string, clerkUserId: string | null | undefined): Promise<MemberGroup[]> {
  if (!clerkUserId) return []
  const { data } = await tenantDb(communityId)
    .from('group_members')
    .select('groups(id, name, icon, description, icon_image, sort_order, collection_id, group_collections(name, show_on_profile, sort_order))')
    .eq('clerk_user_id', clerkUserId)

  type GroupRow = {
    id: string
    name: string
    icon: string | null
    description: string | null
    icon_image: string | null
    sort_order: number
    collection_id: string | null
    group_collections: { name: string; show_on_profile: boolean; sort_order: number } | null
  }
  return (data ?? [])
    .map(r => r.groups as unknown as GroupRow | null)
    .filter((g): g is GroupRow => !!g)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ id, name, icon, description, icon_image, collection_id, group_collections }) => ({
      id, name, icon, description, icon_image,
      collectionId: collection_id ?? null,
      collectionName: group_collections?.name ?? null,
      collectionSort: group_collections?.sort_order ?? 0,
      showOnProfile: group_collections?.show_on_profile ?? true,
    }))
}

// Map of clerk_user_id → group names they belong to. For admin roster/overview
// views that need every member's groups at once (replaces reading setup_preference).
export async function getGroupNamesByUser(communityId: string): Promise<Record<string, string[]>> {
  const { data } = await tenantDb(communityId)
    .from('group_members')
    .select('clerk_user_id, groups(name)')

  const map: Record<string, string[]> = {}
  for (const r of data ?? []) {
    const name = (r.groups as unknown as { name: string } | null)?.name
    if (!name || !r.clerk_user_id) continue
    ;(map[r.clerk_user_id] ??= []).push(name)
  }
  return map
}

// Shape the member's groups as the icon/description metadata CommitmentsSection
// expects (it keys icon/desc by the value shown, which is the group name).
// The description is the group's own admin-configured description (Admin → Groups)
// — the single source of truth. When it's blank, the commitment row shows just the
// title; we deliberately don't substitute a hardcoded default.
export function groupCommitmentMeta(groups: MemberGroup[]) {
  return groups.map(g => ({
    value: g.name,
    // Prefer the group's own emoji icon; fall back to its uploaded icon image,
    // then to a plain mark. CommitmentsSection renders image-path values as <img>.
    icon: g.icon || g.icon_image || '✦',
    description: g.description || '',
  }))
}

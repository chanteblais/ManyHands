import { tenantDb } from './tenant-db'

// clerk_user_id → display name from the canonical members record
// (preferred name wins over first name; last name appended when present),
// falling back to the volunteers record — volunteers hold shifts too, and a
// roster must name them like anyone else. Used wherever a signup row must
// surface as a person, e.g. "Led by …". Ids with no row or no name are simply
// absent from the result.
export async function memberDisplayNames(communityId: string, clerkUserIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(clerkUserIds.filter(Boolean)))
  if (ids.length === 0) return {}
  const db = tenantDb(communityId)
  const [{ data: members }, { data: volunteers }] = await Promise.all([
    db
      .from('members')
      .select('clerk_user_id, first_name, last_name, preferred_name')
      .in('clerk_user_id', ids),
    db
      .from('volunteers')
      .select('clerk_user_id, first_name, last_name, preferred_name')
      .in('clerk_user_id', ids),
  ])
  const names: Record<string, string> = {}
  // Volunteers first so a member row for the same id wins (members canonical).
  for (const m of [...(volunteers ?? []), ...(members ?? [])]) {
    if (!m.clerk_user_id) continue
    const name = [m.preferred_name || m.first_name, m.last_name].filter(Boolean).join(' ').trim()
    if (name) names[m.clerk_user_id] = name
  }
  return names
}

// clerk_user_id → applications.id, for admin surfaces that show a member's
// name and need to link it to their /admin/[id] dossier (the admin detail
// route keys on the application id, not clerk_user_id or members.id). Ids
// with no matching application are simply absent — callers should render
// the name unlinked in that case.
export async function applicationIdsByClerkId(communityId: string, clerkUserIds: string[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(clerkUserIds.filter(Boolean)))
  if (ids.length === 0) return {}
  const { data } = await tenantDb(communityId)
    .from('applications')
    .select('id, clerk_user_id')
    .in('clerk_user_id', ids)
  const result: Record<string, string> = {}
  for (const a of data ?? []) {
    if (a.clerk_user_id) result[a.clerk_user_id] = a.id
  }
  return result
}

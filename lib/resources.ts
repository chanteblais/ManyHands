import { supabaseAdmin } from './supabase'
import { memberDisplayNames } from './member-names'

// ── Member view (Participate → Bring Something) ──────────────────────────────
// Every VISIBLE list with its items, the community-wide claimed total per item,
// the caller's own claim quantity, and WHO has committed (names — social proof
// on the preparation board; members are a trusted community and seeing
// "✓ Erik ✓ Sarah" is the point). Shared by GET /api/resources (the client's
// refresh path) and the server-rendered /participate page (initial data).

export type MemberResourceClaimant = { name: string; quantity: number; me: boolean }
export type MemberResourceItem = {
  id: string
  name: string
  note: string | null
  icon: string | null
  needed: number | null
  claimed: number
  mine: number
  claimants: MemberResourceClaimant[]
  offered_by_name: string | null
  offered_by_me: boolean
}
export type MemberResourceList = {
  id: string
  title: string
  description: string | null
  steward_name: string | null
  show_on_dashboard: boolean
  items: MemberResourceItem[]
}
// The community "pulse" — small proof that people are preparing together
// (derived from claim timestamps; never stored).
export type ResourcePulse = {
  contributorsToday: number // distinct members with claim activity in the last 24h
  latest: { name: string; itemName: string; coveredIt: boolean } | null // most recent claim within 48h
}
export type MemberResourceView = { lists: MemberResourceList[]; pulse: ResourcePulse }

const EMPTY_PULSE: ResourcePulse = { contributorsToday: 0, latest: null }

export async function getMemberResourceView(communityId: string, userId: string): Promise<MemberResourceView> {
  const { data: lists, error } = await supabaseAdmin
    .from('resource_lists')
    .select('id, title, description, visible, show_on_dashboard, sort_order, groups(name), departments(name), roles(name)')
    .eq('visible', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  // Table missing (pre-migration) → empty section rather than a 500.
  if (error) return { lists: [], pulse: EMPTY_PULSE }
  if (!lists || lists.length === 0) return { lists: [], pulse: EMPTY_PULSE }

  const listIds = lists.map(l => l.id)
  const { data: items } = await supabaseAdmin
    .from('resources')
    .select('id, list_id, name, note, quantity_needed, offered_by, icon, sort_order')
    .in('list_id', listIds)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  const itemIds = (items ?? []).map(i => i.id)
  // Offer attribution ("offered by Sam") — the one place member names surface
  // here — and claim totals both depend only on the item rows.
  const [offererNames, claimsRes] = await Promise.all([
    memberDisplayNames(communityId, (items ?? []).map(i => i.offered_by).filter(Boolean) as string[]),
    itemIds.length > 0
      ? supabaseAdmin.from('resource_claims').select('resource_id, clerk_user_id, quantity, updated_at').in('resource_id', itemIds)
      : Promise.resolve({ data: [] }),
  ])

  const claimTotals: Record<string, number> = {}
  const mine: Record<string, number> = {}
  const claimRows = (claimsRes.data ?? []) as { resource_id: string; clerk_user_id: string; quantity: number; updated_at: string }[]
  for (const c of claimRows) {
    claimTotals[c.resource_id] = (claimTotals[c.resource_id] ?? 0) + c.quantity
    if (c.clerk_user_id === userId) mine[c.resource_id] = c.quantity
  }

  // Claimant names depend on the claim rows, so this lookup can't join the
  // batch above.
  const claimantNames = await memberDisplayNames(communityId, claimRows.map(c => c.clerk_user_id))
  const claimantsByItem: Record<string, MemberResourceClaimant[]> = {}
  for (const c of claimRows) {
    ;(claimantsByItem[c.resource_id] ??= []).push({
      name: c.clerk_user_id === userId ? 'You' : claimantNames[c.clerk_user_id] ?? 'A member',
      quantity: c.quantity,
      me: c.clerk_user_id === userId,
    })
  }
  // My own commitment leads each list.
  for (const list of Object.values(claimantsByItem)) list.sort((a, b) => Number(b.me) - Number(a.me))

  const itemsByList: Record<string, MemberResourceItem[]> = {}
  for (const it of items ?? []) {
    ;(itemsByList[it.list_id] ??= []).push({
      id: it.id,
      name: it.name,
      note: it.note,
      icon: it.icon,
      // NULL = open offer (no target) — migration 053.
      needed: it.quantity_needed,
      claimed: claimTotals[it.id] ?? 0,
      mine: mine[it.id] ?? 0,
      claimants: claimantsByItem[it.id] ?? [],
      offered_by_name: it.offered_by ? offererNames[it.offered_by] ?? 'a member' : null,
      offered_by_me: it.offered_by === userId,
    })
  }

  // The pulse: proof of people preparing together, from claim timestamps.
  // updated_at (bumped on quantity change) counts a re-commitment as activity.
  const DAY = 24 * 60 * 60 * 1000
  const now = Date.now()
  const itemById = Object.fromEntries((items ?? []).map(i => [i.id, i]))
  const contributorsToday = new Set(
    claimRows.filter(c => now - new Date(c.updated_at).getTime() < DAY).map(c => c.clerk_user_id)
  ).size
  const latestRow = claimRows
    .filter(c => now - new Date(c.updated_at).getTime() < 2 * DAY)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  const latestItem = latestRow ? itemById[latestRow.resource_id] : undefined
  const pulse: ResourcePulse = {
    contributorsToday,
    latest: latestRow && latestItem ? {
      name: latestRow.clerk_user_id === userId ? 'You' : claimantNames[latestRow.clerk_user_id] ?? 'A member',
      itemName: latestItem.name,
      coveredIt: latestItem.quantity_needed !== null && (claimTotals[latestItem.id] ?? 0) >= (latestItem.quantity_needed as number),
    } : null,
  }

  // Supabase types the embeds as arrays; runtime returns a single row for a to-one FK.
  type NameEmbed = { name: string } | { name: string }[] | null
  const embedName = (e: NameEmbed) => (Array.isArray(e) ? e[0]?.name : e?.name) ?? null
  type ListRow = { id: string; title: string; description: string | null; show_on_dashboard: boolean; groups: NameEmbed; departments: NameEmbed; roles: NameEmbed }
  // Empty visible lists stay: they're valid offer targets (e.g. a catch-all
  // "Odds & Ends" list) — hiding work-in-progress is what `visible` is for.
  const memberLists = ((lists ?? []) as unknown as ListRow[]).map(l => ({
    id: l.id,
    title: l.title,
    description: l.description,
    // At most one steward FK is set (migration 052) — group, department, or role.
    steward_name: embedName(l.groups) ?? embedName(l.departments) ?? embedName(l.roles),
    show_on_dashboard: l.show_on_dashboard ?? false,
    items: itemsByList[l.id] ?? [],
  }))
  return { lists: memberLists, pulse }
}

// ── Home-dashboard "Bring Something" widget ──────────────────────────────────
// A compact index: ONE row per list a member has opted into the dashboard
// (`show_on_dashboard`, migration 070 — default off, so the widget shows
// nothing until at least one list is flagged). Each row carries its
// unit-weighted readiness; the header shows the overall %. Plus the caller's
// own commitments for the personal line. Untargeted contributions never gate
// readiness. Returns null when no list is flagged for the dashboard.
export type ResourceWidgetListRow = {
  title: string
  // A list with no targets is an OPEN CALL — its description doubles as the
  // callout copy on the widget ("Bring anything that sparkles"), so an
  // open-ended list reads as an invitation, never as a dead "No needs yet".
  description: string | null
  hasTargets: boolean // has at least one item with a target
  remaining: number // units still needed (targeted only)
  percentReady: number // unit-weighted for this list; 100 when no targets
  allCovered: boolean // has targets and all covered
  contributions: number // untargeted items on this list (things being brought)
}
export type ResourceWidgetState = {
  lists: ResourceWidgetListRow[] // dashboard-visible lists, most-attention first
  percentReady: number // overall unit-weighted across all flagged lists
  hasAnyTargets: boolean
  allCovered: boolean // there are targets and every one is covered
  myClaims: MemberResourceClaim[] // the caller's claims, board order
}

export async function getResourceWidgetState(clerkUserId: string | null | undefined): Promise<ResourceWidgetState | null> {
  // The caller's claims depend on nothing below — fetch alongside the lists.
  const [myClaims, listsRes] = await Promise.all([
    getMemberResourceClaims(clerkUserId),
    supabaseAdmin
      .from('resource_lists')
      .select('id, title, description, sort_order')
      .eq('visible', true)
      .eq('show_on_dashboard', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ])
  // Table/column missing (pre-migration) or no flagged lists → no widget.
  if (listsRes.error || !listsRes.data || listsRes.data.length === 0) return null
  const lists = listsRes.data

  const { data: items } = await supabaseAdmin
    .from('resources')
    .select('id, list_id, quantity_needed')
    .in('list_id', lists.map(l => l.id))

  const targeted = (items ?? []).filter(i => i.quantity_needed !== null)
  const { data: claims } = targeted.length
    ? await supabaseAdmin.from('resource_claims').select('resource_id, quantity').in('resource_id', targeted.map(i => i.id))
    : { data: [] as { resource_id: string; quantity: number }[] }
  const claimed: Record<string, number> = {}
  for (const c of claims ?? []) claimed[c.resource_id] = (claimed[c.resource_id] ?? 0) + c.quantity

  type Agg = { title: string; description: string | null; sort: number; covered: number; total: number; remaining: number; contributions: number }
  const agg: Record<string, Agg> = Object.fromEntries(
    lists.map(l => [l.id, { title: l.title, description: l.description ?? null, sort: l.sort_order, covered: 0, total: 0, remaining: 0, contributions: 0 }])
  )
  for (const i of items ?? []) {
    const a = agg[i.list_id]
    if (!a) continue
    if (i.quantity_needed === null) { a.contributions += 1; continue }
    const needed = i.quantity_needed as number
    // Over-fulfillment is allowed on the board but never inflates readiness.
    const got = Math.min(claimed[i.id] ?? 0, needed)
    a.total += needed
    a.covered += got
    a.remaining += needed - got
  }

  const percent = (covered: number, total: number) =>
    total === 0 ? 100 : covered >= total ? 100 : Math.min(99, Math.round((covered / total) * 100))

  const rows: ResourceWidgetListRow[] = Object.values(agg).map(a => ({
    title: a.title,
    description: a.description,
    hasTargets: a.total > 0,
    remaining: a.remaining,
    percentReady: percent(a.covered, a.total),
    allCovered: a.total > 0 && a.remaining === 0,
    contributions: a.contributions,
  }))
  // Most attention first: lists still short (largest shortfall), then covered,
  // then board order.
  rows.sort((a, b) => (b.remaining - a.remaining) || Number(b.hasTargets) - Number(a.hasTargets) || 0)

  const totalCovered = Object.values(agg).reduce((s, a) => s + a.covered, 0)
  const totalUnits = Object.values(agg).reduce((s, a) => s + a.total, 0)
  const hasAnyTargets = totalUnits > 0
  return {
    lists: rows,
    percentReady: percent(totalCovered, totalUnits),
    hasAnyTargets,
    allCovered: hasAnyTargets && totalCovered >= totalUnits,
    myClaims,
  }
}

// A member's resource claims, shaped for the Active Commitments card
// ("Camping Stove ×2 · Shared Kitchen"). Claims on hidden lists still show —
// the member made the commitment; hiding a list gates discovery, not honesty.
export type MemberResourceClaim = {
  id: string
  resourceName: string
  listTitle: string
  quantity: number
  icon: string | null
}

export async function getMemberResourceClaims(clerkUserId: string | null | undefined): Promise<MemberResourceClaim[]> {
  if (!clerkUserId) return []
  const { data, error } = await supabaseAdmin
    .from('resource_claims')
    .select('id, quantity, resources(name, icon, sort_order, resource_lists(title, sort_order))')
    .eq('clerk_user_id', clerkUserId)

  // Table missing (pre-migration) → no rows rather than a crash.
  if (error) return []

  type ResourceEmbed = {
    name: string
    icon: string | null
    sort_order: number
    resource_lists: { title: string; sort_order: number } | { title: string; sort_order: number }[] | null
  }
  type Row = {
    id: string
    quantity: number
    // Supabase types the embeds as arrays; runtime returns a single row for a to-one FK.
    resources: ResourceEmbed | ResourceEmbed[] | null
  }

  return ((data ?? []) as unknown as Row[])
    .map(r => {
      const res = Array.isArray(r.resources) ? r.resources[0] : r.resources
      if (!res) return null
      const list = Array.isArray(res.resource_lists) ? res.resource_lists[0] : res.resource_lists
      return {
        id: r.id,
        resourceName: res.name,
        listTitle: list?.title ?? '',
        quantity: r.quantity,
        icon: res.icon,
        _sort: (list?.sort_order ?? 0) * 1000 + res.sort_order,
      }
    })
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort((a, b) => a._sort - b._sort)
    .map(({ id, resourceName, listTitle, quantity, icon }) => ({ id, resourceName, listTitle, quantity, icon }))
}

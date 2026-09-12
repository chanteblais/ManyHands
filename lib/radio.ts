// Radio — the curated community feed (docs/radio.md).
//
// Radio is NOT an audit log. Every post must pass "would the average member
// care?" — it records moments, not database changes, in an editorial voice:
// a headline (message) plus an optional supporting line (detail) that gives
// the moment momentum ("Only one more to go!").
//
// Stored posts live in radio_events, written by the route where the moment
// happens. Time-derived items (the Now / Up next strip) are never stored —
// the server supplies the day's candidate events and the client picks what's
// live against the member's own clock (their device is at camp; the server
// is in UTC).

import { tenantDb } from '@/lib/tenant-db'
import { getPageContent, getPageContentValue } from '@/lib/page-content'

export type RadioKind =
  | 'broadcast'     // 📢 organizer announcement
  | 'welcome'       // 👋 a new member joins
  | 'contribution'  // ✨ someone covers a needed resource
  | 'achievement'   // 🏅 a distinction is earned
  | 'milestone'     // 🎉 a community goal completes
  | 'voice'         // ✦ a member puts a moment on the air

// Default emoji + short plural label per kind — the single source for any UI
// that needs to name a kind (currently the /radio feed's kind filter row).
// Individual posts can still override their own icon (radio_events.icon);
// this is only the canonical default/label pairing.
export const RADIO_KIND_META: Record<RadioKind, { emoji: string; label: string }> = {
  broadcast: { emoji: '📢', label: 'Broadcasts' },
  welcome: { emoji: '👋', label: 'Welcomes' },
  contribution: { emoji: '✨', label: 'Contributions' },
  achievement: { emoji: '🏅', label: 'Achievements' },
  milestone: { emoji: '🎉', label: 'Milestones' },
  voice: { emoji: '✦', label: 'Voices' },
}

export type RadioEventRow = {
  id: string
  kind: string
  message: string
  detail: string | null
  icon: string | null
  actor_clerk_id: string | null
  actor_name: string | null
  link: string | null
  created_at: string
  created_by?: string | null
}

// ── Config (page_content.config_radio) ────────────────────────────
// Which automatic sources broadcast. Absent key / malformed JSON = all on.
// Organizer broadcasts have no toggle — posting one is already the decision.

export type RadioSources = {
  welcome: boolean       // 👋 Welcome Sarah to Glåüm!
  contribution: boolean  // ✨ Sarah just covered a camping stove.
  achievement: boolean   // 🏅 Erik earned the Setup distinction.
  milestone: boolean     // 🎉 Shared Kitchen is now fully equipped.
  voice: boolean         // ✦ member posts (the composer on /radio)
}

export const DEFAULT_RADIO_SOURCES: RadioSources = {
  welcome: true,
  contribution: true,
  achievement: true,
  milestone: true,
  voice: true,
}

export function parseRadioSources(raw?: string | null): RadioSources {
  if (!raw) return { ...DEFAULT_RADIO_SOURCES }
  try {
    const sources = (JSON.parse(raw)?.sources ?? {}) as Partial<Record<keyof RadioSources, unknown>>
    return {
      welcome: sources.welcome !== false,
      contribution: sources.contribution !== false,
      achievement: sources.achievement !== false,
      milestone: sources.milestone !== false,
      voice: sources.voice !== false,
    }
  } catch {
    return { ...DEFAULT_RADIO_SOURCES }
  }
}

// ── Writing ───────────────────────────────────────────────────────

export type RadioEventInput = {
  kind: RadioKind
  message: string
  detail?: string | null
  icon?: string | null
  actorClerkId?: string | null
  actorName?: string | null
  link?: string | null
  createdBy?: string | null
}

// Best-effort insert — a failed radio post must never break the action it
// rode on (approval, claim, grant), so this logs and swallows.
export async function postRadioEvent(communityId: string, event: RadioEventInput): Promise<string | null> {
  try {
    const { data, error } = await tenantDb(communityId)
      .from('radio_events')
      .insert([{
        kind: event.kind,
        message: event.message,
        detail: event.detail ?? null,
        icon: event.icon ?? null,
        actor_clerk_id: event.actorClerkId ?? null,
        actor_name: event.actorName ?? null,
        link: event.link ?? null,
        created_by: event.createdBy ?? null,
      }])
      .select('id')
      .single()
    if (error) {
      console.error('[radio] post failed', error)
      return null
    }
    return data?.id ?? null
  } catch (e) {
    console.error('[radio] post failed', e)
    return null
  }
}

// Gated variant for the automatic sources — checks the config toggle first.
export async function postSourcedRadioEvent(
  communityId: string,
  source: keyof RadioSources,
  event: RadioEventInput,
): Promise<void> {
  try {
    const radioValue = await getPageContentValue(communityId, 'config_radio')
    if (!parseRadioSources(radioValue)[source]) return
    await postRadioEvent(communityId, event)
  } catch (e) {
    console.error('[radio] sourced post failed', e)
  }
}

// First name for a radio line ("Sarah just covered…") — Radio is
// members-only, so first names are the right register.
export async function getRadioActorName(communityId: string, clerkUserId: string): Promise<string> {
  try {
    const { data } = await tenantDb(communityId)
      .from('members')
      .select('preferred_name, first_name')
      .eq('clerk_user_id', clerkUserId)
      .maybeSingle()
    return data?.preferred_name || data?.first_name || 'A member'
  } catch {
    return 'A member'
  }
}

// ── Editorial copy ────────────────────────────────────────────────
// The voice of the feed lives here, in one place. Headlines are warm and
// present-tense; details give momentum. Item names are stored Sentence-cased
// ("Camping stove") — lowercase mid-sentence unless the name looks like a
// proper noun / acronym.

const midSentence = (name: string) => {
  const trimmed = name.trim()
  return /^[A-Z][a-z]/.test(trimmed) ? trimmed[0].toLowerCase() + trimmed.slice(1) : trimmed
}
const article = (noun: string) => (/^[aeiou]/i.test(noun) ? 'an' : 'a')

// `**…**` in a message renders as a gold entity highlight (see
// components/RadioMessage.tsx) — the person or thing the moment is about.

export function welcomeRadioPost(communityName: string, name: string): RadioEventInput {
  return {
    kind: 'welcome',
    message: `Welcome **${name}** to ${communityName}!`,
    detail: 'Say hello if you see them around camp. 🌿',
    icon: '👋',
  }
}

// remaining = how many of this item are still uncovered AFTER this claim
// (null for open offers with no target).
export function contributionRadioPost(
  actorName: string,
  itemName: string,
  quantity: number,
  remaining: number | null,
): RadioEventInput {
  const item = midSentence(itemName)
  const what = quantity > 1 ? `**${quantity} × ${item}**` : `${article(item)} **${item}**`
  return {
    kind: 'contribution',
    message: `${actorName} is bringing ${what}.`,
    detail:
      remaining === null
        ? null
        : remaining <= 0
          ? 'That was the last one — fully covered! ✦'
          : remaining === 1
            ? 'Only one more is still needed! 🙌'
            : `${remaining} more are still needed.`,
    icon: '✨',
    link: '/participate#bring',
  }
}

export function achievementRadioPost(
  actorName: string,
  label: string,
  engraving?: string | null,
  medalIcon?: string | null,
): RadioEventInput {
  return {
    kind: 'achievement',
    message: `**${actorName}** earned **${label}**.`,
    detail: engraving || null,
    icon: medalIcon || '🏅',
  }
}

export function listMilestoneRadioPost(listTitle: string): RadioEventInput {
  return {
    kind: 'milestone',
    message: `**${listTitle}** is now fully equipped.`,
    detail: 'Every item covered — many hands make light work ✦',
    icon: '🎉',
    link: '/participate#bring',
  }
}

// ── Milestone detection ───────────────────────────────────────────
// After a claim lands, report the claimed item's remaining need and whether
// the whole list just became fully covered. One post per list completion —
// guarded against refires by an existing-milestone check (quantities bounce;
// the feed shouldn't).

export async function resourceStateAfterClaim(
  communityId: string,
  resourceId: string,
  listId: string,
): Promise<{ remaining: number | null; listJustCompleted: boolean; listTitle: string | null }> {
  try {
    const db = tenantDb(communityId)
    const [{ data: items }, { data: list }] = await Promise.all([
      db.from('resources').select('id, quantity_needed').eq('list_id', listId),
      db.from('resource_lists').select('title').eq('id', listId).maybeSingle(),
    ])
    const itemIds = (items ?? []).map(i => i.id)
    const { data: claims } = itemIds.length
      ? await db.from('resource_claims').select('resource_id, quantity').in('resource_id', itemIds)
      : { data: [] as { resource_id: string; quantity: number }[] }

    const claimedByItem: Record<string, number> = {}
    for (const c of claims ?? []) {
      claimedByItem[c.resource_id] = (claimedByItem[c.resource_id] ?? 0) + c.quantity
    }

    let remaining: number | null = null
    const tracked = (items ?? []).filter(i => i.quantity_needed !== null)
    let listCovered = tracked.length > 0
    for (const item of items ?? []) {
      const itemRemaining =
        item.quantity_needed === null ? null : Math.max(0, item.quantity_needed - (claimedByItem[item.id] ?? 0))
      if (item.id === resourceId) remaining = itemRemaining
      if (itemRemaining !== null && itemRemaining > 0) listCovered = false
    }

    let listJustCompleted = false
    if (listCovered && list?.title) {
      const { data: existing } = await db
        .from('radio_events')
        .select('id')
        .eq('kind', 'milestone')
        .eq('message', listMilestoneRadioPost(list.title).message)
        .limit(1)
        .maybeSingle()
      listJustCompleted = !existing
    }

    return { remaining, listJustCompleted, listTitle: list?.title ?? null }
  } catch (e) {
    console.error('[radio] resource state failed', e)
    return { remaining: null, listJustCompleted: false, listTitle: null }
  }
}

// ── Reading ───────────────────────────────────────────────────────

// Latest visible posts. No avatar join — the feed's visual language is big
// emoji + gold entity highlights, not faces (mockup decision 2026-07-03).
export async function getRadioFeed(communityId: string, limit = 60): Promise<RadioEventRow[]> {
  const db = tenantDb(communityId)
  const { data, error } = await db
    .from('radio_events')
    .select('id, kind, message, detail, icon, actor_clerk_id, actor_name, link, created_at, created_by')
    .eq('visible', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) {
    if (error) console.error('[radio] feed read failed', error)
    return []
  }

  // Every spoken row reads "— Name". New posts store actor_name at write time;
  // legacy rows (broadcasts posted before signing) may not — so derive the
  // signature from the post's author (created_by, else actor_clerk_id) when
  // it's missing. Best-effort, never persisted; skipped entirely once no row
  // needs it (the steady state), so it costs nothing on a normal feed load.
  const needsName = data.filter(r => !r.actor_name && (r.created_by || r.actor_clerk_id))
  if (needsName.length) {
    const ids = Array.from(new Set(needsName.map(r => r.created_by || r.actor_clerk_id).filter(Boolean))) as string[]
    const { data: mem } = await db
      .from('members')
      .select('clerk_user_id, preferred_name, first_name')
      .in('clerk_user_id', ids)
    const nameById = new Map((mem ?? []).map(m => [m.clerk_user_id, m.preferred_name || m.first_name]))
    for (const r of data) {
      if (r.actor_name) continue
      const who = r.created_by || r.actor_clerk_id
      const nm = who ? nameById.get(who) : null
      if (nm) r.actor_name = nm
    }
  }

  return data
}

// The stats band on /radio: posts this week + all-time counts per moment
// family. Four cheap head-counts in one round-trip.
export type RadioStats = {
  postsThisWeek: number
  contributions: number
  achievements: number
  broadcasts: number
}

export async function getRadioStats(communityId: string): Promise<RadioStats> {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  try {
    const db = tenantDb(communityId)
    const [week, contributions, achievements, broadcasts] = await Promise.all([
      db.from('radio_events').select('id', { count: 'exact', head: true }).eq('visible', true).gte('created_at', weekAgo),
      db.from('radio_events').select('id', { count: 'exact', head: true }).eq('visible', true).eq('kind', 'contribution'),
      db.from('radio_events').select('id', { count: 'exact', head: true }).eq('visible', true).eq('kind', 'achievement'),
      db.from('radio_events').select('id', { count: 'exact', head: true }).eq('visible', true).eq('kind', 'broadcast'),
    ])
    return {
      postsThisWeek: week.count ?? 0,
      contributions: contributions.count ?? 0,
      achievements: achievements.count ?? 0,
      broadcasts: broadcasts.count ?? 0,
    }
  } catch (e) {
    console.error('[radio] stats failed', e)
    return { postsThisWeek: 0, contributions: 0, achievements: 0, broadcasts: 0 }
  }
}

// ── Now / Up next strip (derived, never stored) ───────────────────

export type RadioDayEvent = {
  title: string
  start_time: string        // "HH:MM"
  end_time: string | null
  participation_type: string
}

export type RadioNowData = {
  welcome: string | null         // "Day 2 of camp" — null outside the event range
  todayEvents: RadioDayEvent[]   // today's general + mandatory events, client picks now/next
}

const isoToday = () => new Date().toISOString().slice(0, 10)

export async function getRadioNowData(communityId: string): Promise<RadioNowData> {
  const today = isoToday()

  const [config, { data: events }] = await Promise.all([
    getPageContent(communityId, ['config_event_start_date', 'config_event_end_date']),
    tenantDb(communityId)
      .from('schedule_events')
      .select('title, start_time, end_time, participation_type, event_date, is_recurring, recurrence_days')
      .eq('visible', true)
      .eq('show_on_schedule', true)
      .in('participation_type', ['general', 'mandatory'])
      .or(`event_date.eq.${today},is_recurring.eq.true`),
  ])

  const rangeStart = config['config_event_start_date'] ?? null
  const rangeEnd = config['config_event_end_date'] ?? null

  // The welcome line only makes sense while camp is actually running.
  let welcome: string | null = null
  const inRange = rangeStart && rangeEnd && rangeStart <= today && today <= rangeEnd
  if (inRange) {
    const dayNumber = Math.round(
      (new Date(`${today}T12:00:00`).getTime() - new Date(`${rangeStart}T12:00:00`).getTime()) / 86400000,
    ) + 1
    welcome = `Day ${dayNumber} of camp`
  }

  const todayEvents = (events ?? [])
    .filter(e => {
      if (!e.start_time) return false
      if (!e.is_recurring) return e.event_date === today
      // Recurring: an explicit date list repeats on just those days; no list
      // means every day of the event range (matching the schedule calendar).
      if (Array.isArray(e.recurrence_days) && e.recurrence_days.length > 0) {
        return e.recurrence_days.includes(today)
      }
      return Boolean(inRange)
    })
    .map(e => ({
      title: e.title as string,
      start_time: e.start_time as string,
      end_time: (e.end_time as string | null) ?? null,
      participation_type: (e.participation_type as string) ?? 'general',
    }))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  return { welcome, todayEvents }
}

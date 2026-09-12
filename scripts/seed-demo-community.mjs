#!/usr/bin/env node
// Seed (or reseed) the fictional demo community — docs/business.md → Showcase
// & demo strategy; docs/tenancy-design.md → tenant 2 rehearsal. Content lives
// in scripts/seed-demo/content.mjs; this file turns it into rows.
//
//   node scripts/seed-demo-community.mjs --dry-run              # validate + plan, no writes
//   node scripts/seed-demo-community.mjs                        # create (fails if the community already has rows)
//   node scripts/seed-demo-community.mjs --reset                # wipe the demo community's rows + avatars, then seed
//   … --organizer=user_a,user_b   also give those real Clerk users an approved ADMIN member row each
//                                (pass both your prod and dev-instance ids: localhost signs into the dev instance)
//   … --no-avatars           skip generating/uploading portrait images
//
// Writes ONLY rows carrying the demo community's id (every insert stamps it),
// plus avatar objects under `<community_id>/…` in the `avatars` bucket. Uses
// the service-role key (bypasses RLS) like the other maintenance scripts.
// Idempotent with --reset. Never touches any other community.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import * as C from './seed-demo/content.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const argv = process.argv.slice(2)
const DRY = argv.includes('--dry-run')
const RESET = argv.includes('--reset')
const AVATARS = !argv.includes('--no-avatars')
const ORGANIZERS = (argv.find(a => a.startsWith('--organizer=')) ?? '').slice('--organizer='.length).split(',').map(s => s.trim()).filter(Boolean)

function envVar(name) {
  const line = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n').find(l => l.startsWith(name + '='))
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : null
}
const supabase = createClient(envVar('NEXT_PUBLIC_SUPABASE_URL'), envVar('SUPABASE_SERVICE_ROLE_KEY'))

// ── helpers ──────────────────────────────────────────────────────────────────
const CLERK_PREFIX = `user_demo_${C.COMMUNITY.slug.replace(/-/g, '')}_`
const clerkId = i => `${CLERK_PREFIX}${String(i + 1).padStart(2, '0')}`
const iso = d => d.toISOString().slice(0, 10)
const addDays = (isoDate, n) => { const d = new Date(`${isoDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const daysAgo = n => new Date(Date.now() - n * 86_400_000).toISOString()
const weekday = isoDate => new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })
const fmt12 = t => { const [h, m] = t.split(':').map(Number); const ap = h < 12 ? 'AM' : 'PM'; const hh = ((h + 11) % 12) + 1; return m ? `${hh}:${String(m).padStart(2, '0')} ${ap}` : `${hh} ${ap}` }
const timeLabel = (s, e) => `${fmt12(s)} – ${fmt12(e)}`
const displayName = m => m.preferred || m.first
const fullName = m => `${displayName(m)} ${m.last}`
const email = m => `${m.first}.${m.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.org'
const phone = i => `+1 555 01${String(i).padStart(2, '0')} ${String(1000 + i * 37).slice(-4)}`
// deterministic "random"
let seed = 7
const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
const pick = (arr, n) => { const a = [...arr]; const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rand() * a.length), 1)[0]); return out }

let inserted = 0
async function insert(table, rows, select = 'id') {
  if (!rows.length) return []
  if (DRY) { inserted += rows.length; return rows.map((r, i) => ({ ...r, id: r.id ?? `dry-${table}-${i}` })) }
  const { data, error } = await supabase.from(table).insert(rows).select(select)
  if (error) throw new Error(`${table}: ${error.message}`)
  inserted += data.length
  return data
}

// ── 0. validate content ──────────────────────────────────────────────────────
const roleIndex = new Map()
for (const [dept, roles] of Object.entries(C.ROLES)) {
  if (!C.DEPARTMENTS.some(d => d.name === dept)) throw new Error(`ROLES references unknown department "${dept}"`)
  for (const r of roles) roleIndex.set(`${dept} / ${r.name}`, { dept, ...r })
}
const groupNames = new Set(C.GROUP_COLLECTIONS.flatMap(c => c.groups.map(g => g.name)))
C.MEMBERS.forEach((m, i) => {
  if (m.role && !roleIndex.has(m.role)) throw new Error(`MEMBERS[${i}] ${m.first}: unknown role "${m.role}"`)
  for (const g of m.groups) if (!groupNames.has(g)) throw new Error(`MEMBERS[${i}] ${m.first}: unknown group "${g}"`)
})
for (const l of C.RESOURCE_LISTS) if (l.group && !groupNames.has(l.group)) throw new Error(`RESOURCE_LISTS "${l.title}": unknown group "${l.group}"`)
for (const s of C.SCHEDULE) if (!C.SHIFT_TYPES.some(t => t.name === s.type)) throw new Error(`SCHEDULE "${s.title}": unknown shift type "${s.type}"`)
console.log(`content ok: ${C.DEPARTMENTS.length} departments, ${roleIndex.size} roles, ${C.SHIFT_TYPES.length} shift types, ${C.SCHEDULE.length} events, ${groupNames.size} groups, ${C.MEMBERS.length} members${DRY ? '  (DRY RUN)' : ''}`)

// ── 1. community row ─────────────────────────────────────────────────────────
const communityRow = {
  slug: C.COMMUNITY.slug, name: C.COMMUNITY.name, description: C.COMMUNITY.description,
  hosts: C.COMMUNITY.hosts, timezone: C.COMMUNITY.timezone, event_name: C.COMMUNITY.eventName,
  theme: C.COMMUNITY.theme, settings: { nudge_hour_local: 9 }, status: 'active',
}
let cid
{
  const { data: existing } = await supabase.from('communities').select('id').eq('slug', C.COMMUNITY.slug).maybeSingle()
  if (existing) {
    cid = existing.id
    if (!DRY) { const { error } = await supabase.from('communities').update(communityRow).eq('id', cid); if (error) throw error }
  } else if (DRY) {
    cid = '00000000-0000-0000-0000-00000000dead'
  } else {
    const { data, error } = await supabase.from('communities').insert(communityRow).select('id').single()
    if (error) throw error
    cid = data.id
  }
}
const stamp = rows => rows.map(r => ({ ...r, community_id: cid }))
console.log(`community: ${C.COMMUNITY.slug} (${cid})`)

// ── 2. reset ─────────────────────────────────────────────────────────────────
const SCOPED_TABLES_CHILD_FIRST = [
  'messages', 'conversation_participants', 'conversations', 'poll_votes', 'polls', 'resource_claims', 'resources', 'resource_lists',
  'lead_up_event_rsvps', 'lead_up_events', 'member_shift_signups', 'event_rsvps', 'schedule_events', 'camp_signups', 'group_members', 'groups',
  'group_collections', 'roles', 'departments', 'shift_types', 'member_distinctions', 'member_profiles', 'members', 'applications', 'volunteers',
  'shoutouts', 'radio_events', 'announcements', 'admin_notifications', 'user_notifications', 'role_suggestions', 'attunement_nudges',
  'event_reminders_sent', 'page_content',
]
{
  const { count } = await supabase.from('members').select('*', { count: 'exact', head: true }).eq('community_id', cid)
  if ((count ?? 0) > 0 && !RESET && !DRY) throw new Error(`community already has ${count} member rows — pass --reset to wipe and reseed`)
  if (RESET && !DRY) {
    for (const t of SCOPED_TABLES_CHILD_FIRST) {
      const { error } = await supabase.from(t).delete().eq('community_id', cid)
      if (error) throw new Error(`reset ${t}: ${error.message}`)
    }
    const { data: objs } = await supabase.storage.from('avatars').list(cid, { limit: 1000 })
    for (const o of objs ?? []) {
      const { data: files } = await supabase.storage.from('avatars').list(`${cid}/${o.name}`, { limit: 100 })
      if (files?.length) await supabase.storage.from('avatars').remove(files.map(f => `${cid}/${o.name}/${f.name}`))
    }
    console.log('reset: previous demo rows and avatars removed')
  }
}

// ── 3. structure ─────────────────────────────────────────────────────────────
const deptRows = await insert('departments', stamp(C.DEPARTMENTS.map((d, i) => ({ name: d.name, description: d.description, icon: d.icon, sort_order: i }))), 'id, name')
const deptId = Object.fromEntries(deptRows.map(d => [d.name, d.id]))

const roleRows = await insert('roles', stamp([...roleIndex.entries()].map(([key, r], i) => ({
  name: r.name, description: r.description, capacity: r.capacity, requires_approval: !!r.requires_approval,
  department_id: deptId[r.dept], sort_order: i,
}))), 'id, name, department_id')
const roleId = {}
for (const [key, r] of roleIndex.entries()) roleId[key] = roleRows.find(row => row.name === r.name && row.department_id === deptId[r.dept]).id

const typeRows = await insert('shift_types', stamp(C.SHIFT_TYPES.map((t, i) => ({ name: t.name, icon: t.icon, sort_order: i }))), 'id, name')
const typeId = Object.fromEntries(typeRows.map(t => [t.name, t.id]))

const eventRows = await insert('schedule_events', stamp(C.SCHEDULE.map((s, i) => {
  const date = addDays(C.COMMUNITY.eventStart, s.day)
  return {
    title: s.title, day: weekday(date), event_date: s.nightly ? null : date, time: timeLabel(s.start, s.end),
    start_time: s.start, end_time: s.end, participation_type: 'shift', shift_type_id: typeId[s.type],
    capacity: s.capacity, needs_lead: !!s.needs_lead, is_recurring: !!s.nightly, recurrence_days: null,
    visible: true, show_on_schedule: true, icon_type: 'star', sort_order: i,
  }
})), 'id, title, is_recurring, start_time, end_time, capacity, needs_lead')

const collRows = await insert('group_collections', stamp(C.GROUP_COLLECTIONS.map((c, i) => ({ name: c.name, selection: c.selection, self_join: c.self_join, show_on_profile: true, sort_order: i }))), 'id, name')
const collId = Object.fromEntries(collRows.map(c => [c.name, c.id]))
const groupRows = await insert('groups', stamp(C.GROUP_COLLECTIONS.flatMap((c, ci) => c.groups.map((g, gi) => ({
  name: g.name, description: g.description, icon: g.icon, collection_id: collId[c.name], join_policy: 'open', visibility: 'listed', sort_order: ci * 10 + gi,
})))), 'id, name')
const groupId = Object.fromEntries(groupRows.map(g => [g.name, g.id]))
const groupConvRows = await insert('conversations', stamp(groupRows.map(g => ({ type: 'group', group_id: g.id }))), 'id, group_id')
const groupConvId = Object.fromEntries(groupConvRows.map(c => [c.group_id, c.id]))

// ── 4. people ────────────────────────────────────────────────────────────────
const PALETTE = ['#E0B45A', '#4FB3A9', '#C96A5B', '#6D8ECF', '#9C7BC4', '#5FA86B', '#D08A3E', '#8A6E5A']
async function avatarUrl(i, m) {
  if (!AVATARS || DRY) return null
  const { default: sharp } = await import('sharp')
  const initials = (m.first[0] + m.last[0]).toUpperCase()
  const bg = PALETTE[i % PALETTE.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" rx="128" fill="${bg}"/><text x="128" y="152" text-anchor="middle" font-family="Georgia, serif" font-size="104" fill="#1A1410" opacity="0.85">${initials}</text></svg>`
  const buf = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer()
  const p = `${cid}/${clerkId(i)}/avatar.webp`
  const { error } = await supabase.storage.from('avatars').upload(p, buf, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
  if (error) throw new Error(`avatar ${p}: ${error.message}`)
  return supabase.storage.from('avatars').getPublicUrl(p).data.publicUrl
}

const people = []
for (let i = 0; i < C.MEMBERS.length; i++) {
  const m = C.MEMBERS[i]
  people.push({ i, m, clerk: clerkId(i), avatar: await avatarUrl(i, m), approved: m.state !== 'pending', pending: m.state === 'pending', suspended: m.state === 'suspended' })
}
for (const org of ORGANIZERS) people.push({ i: people.length, m: { first: 'Demo', last: 'Organizer', preferred: null, pronouns: null, role: null, since: 2024, groups: [], bio: 'Explores the hollow on behalf of curious organizers.', admin: true }, clerk: org, avatar: null, approved: true, organizer: true })

const appRows = await insert('applications', stamp(people.map(p => ({
  clerk_user_id: p.clerk, first_name: p.m.first, last_name: p.m.last, preferred_name: p.m.preferred, pronouns: p.m.pronouns,
  email: p.organizer ? 'organizer@example.org' : email(p.m), phone: phone(p.i), status: p.pending ? 'pending' : 'approved',
  avatar_url: p.avatar, submitted_at: daysAgo(120 - p.i * 3), reviewed_at: p.pending ? null : daysAgo(118 - p.i * 3),
  reviewed_by: p.pending ? null : clerkId(0), public_bio: p.m.bio ?? null,
}))), 'id, clerk_user_id')
const appId = Object.fromEntries(appRows.map(a => [a.clerk_user_id, a.id]))

const memberRows = await insert('members', stamp(people.map(p => ({
  clerk_user_id: p.clerk, application_id: appId[p.clerk], first_name: p.m.first, last_name: p.m.last, preferred_name: p.m.preferred,
  pronouns: p.m.pronouns, email: p.organizer ? 'organizer@example.org' : email(p.m), phone: phone(p.i), avatar_url: p.avatar,
  status: p.pending ? 'pending' : 'approved', role: p.m.admin ? 'admin' : 'member',
  suspended_at: p.suspended ? daysAgo(9) : null, suspended_by: p.suspended ? clerkId(0) : null, suspension_note: p.suspended ? 'Away for a family thing; back for teardown.' : null,
  dues_paid_at: !p.pending && p.i % 3 !== 2 ? daysAgo(40 - p.i) : null, dues_paid_by: !p.pending && p.i % 3 !== 2 ? clerkId(0) : null,
  dues_note: !p.pending && p.i % 3 === 0 ? 'e-transfer' : null, dues_reported_at: !p.pending && p.i % 3 === 2 && p.i % 2 === 0 ? daysAgo(5) : null,
}))), 'id, clerk_user_id')
const memberId = Object.fromEntries(memberRows.map(r => [r.clerk_user_id, r.id]))

await insert('member_profiles', stamp(people.map(p => ({
  member_id: memberId[p.clerk],
  values: {
    ...(p.m.bio ? { bio: p.m.bio } : {}),
    gatheringsAttended: Array.from({ length: Math.max(0, 2027 - p.m.since) }, (_, k) => String(p.m.since + k)),
    eventExperience: Array.from({ length: Math.max(0, 2027 - p.m.since) }, (_, k) => String(p.m.since + k)).filter(y => y <= '2026'),
  },
}))), 'member_id')

// roles: one row per person. Ines holds the restricted Porridge Lead (approved);
// Luca's row becomes a PENDING request for it, so the admin console has a
// role request to act on.
const signupByClerk = new Map()
for (const p of people) {
  if (!p.m.role || p.pending) continue
  const r = roleIndex.get(p.m.role)
  signupByClerk.set(p.clerk, { clerk_user_id: p.clerk, role_id: roleId[p.m.role], role_approval_status: r.requires_approval ? 'approved' : null })
}
signupByClerk.set(clerkId(10), { clerk_user_id: clerkId(10), role_id: roleId['Tea House / Porridge Lead'], role_approval_status: 'pending' })
await insert('camp_signups', stamp([...signupByClerk.values()]), 'id')

await insert('group_members', stamp(people.flatMap(p => p.m.groups.map(g => ({ group_id: groupId[g], clerk_user_id: p.clerk, source: 'admin' })))), 'id')
await insert('messages', stamp(people.flatMap(p => p.m.groups.map(g => ({
  conversation_id: groupConvId[groupId[g]], sender_clerk_id: 'system', sender_name: g, visible_to: p.clerk,
  body: `Welcome to ${g}! ✦ You're a member of this group — this is its message thread.`, created_at: daysAgo(100 - p.i),
})))), 'id')

// shifts: fill each event with approved, unsuspended members; leads where needed
const eligible = people.filter(p => p.approved && !p.suspended && !p.organizer)
const shiftRows = []
for (const ev of eventRows) {
  const nights = ev.is_recurring ? [0, 1, 2, 3].map(n => addDays(C.COMMUNITY.eventStart, n)) : [null]
  for (const night of nights) {
    const holders = pick(eligible, Math.max(1, Math.min(ev.capacity ?? 2, Math.round((ev.capacity ?? 2) * 0.7))))
    holders.forEach((p, k) => shiftRows.push({ clerk_user_id: p.clerk, schedule_event_id: ev.id, occurrence_date: night, role: ev.needs_lead && k === 0 ? 'lead' : 'member' }))
  }
}
const seen = new Set()
await insert('member_shift_signups', stamp(shiftRows.filter(r => { const k = `${r.clerk_user_id}|${r.schedule_event_id}|${r.occurrence_date}`; if (seen.has(k)) return false; seen.add(k); return true })), 'id')

// gatherings + rsvps
const gatheringRows = await insert('lead_up_events', stamp(C.GATHERINGS.map((g, i) => ({
  title: g.title, event_date: addDays(C.COMMUNITY.eventStart, g.day), start_time: g.time, location: g.location, link: g.link, visible: true, sort_order: i,
  notified_at: daysAgo(30),
}))), 'id')
await insert('lead_up_event_rsvps', stamp(gatheringRows.flatMap((g, gi) => pick(eligible, 8 + gi * 3).map(p => ({ lead_up_event_id: g.id, clerk_user_id: p.clerk, status: 'going' })))), 'id')

// resources
const listRows = await insert('resource_lists', stamp(C.RESOURCE_LISTS.map((l, i) => ({ title: l.title, group_id: l.group ? groupId[l.group] : null, visible: true, show_on_dashboard: i === 0, sort_order: i }))), 'id, title')
const itemRows = await insert('resources', stamp(C.RESOURCE_LISTS.flatMap((l, li) => l.items.map((it, ii) => ({
  list_id: listRows[li].id, name: it.name, quantity_needed: it.quantity, sort_order: ii,
})))), 'id, quantity_needed')
await insert('resource_claims', stamp(itemRows.flatMap((it, k) => {
  const need = it.quantity_needed ?? 1
  const claimers = pick(eligible, Math.min(3, need))
  let left = k % 4 === 3 ? Math.max(1, Math.floor(need / 2)) : need // every 4th item stays partly open
  return claimers.map(p => { const q = Math.max(1, Math.min(left, Math.ceil(need / claimers.length))); left -= q; return { resource_id: it.id, clerk_user_id: p.clerk, quantity: q } }).filter(c => c.quantity > 0)
})), 'id')

// poll, announcements, shoutouts, radio, distinctions
const [poll] = await insert('polls', stamp([{ question: C.POLL.question, options: C.POLL.options, visible: true, allow_multiple: false }]), 'id')
await insert('poll_votes', stamp(pick(eligible, 14).map((p, k) => ({ poll_id: poll.id, clerk_user_id: p.clerk, option_index: [0, 1, 1, 3, 2, 1, 3][k % 7] }))), 'id')
await insert('announcements', stamp(C.ANNOUNCEMENTS.map(a => ({ title: a.title, body: a.body, pinned: a.pinned, visible: true }))), 'id')
await insert('shoutouts', stamp(C.SHOUTOUTS.map((body, k) => ({ clerk_user_id: eligible[k * 2].clerk, author_name: fullName(eligible[k * 2].m), body, visible: true, created_at: daysAgo(12 - k * 4) }))), 'id')
await insert('radio_events', stamp(C.RADIO.map(r => {
  const actor = r.actor != null ? people[r.actor] : null
  return { kind: r.kind, message: r.message, detail: r.detail, actor_clerk_id: actor?.clerk ?? null, actor_name: actor ? fullName(actor.m) : null,
    link: actor ? `/members/${appId[actor.clerk]}` : null, visible: true, created_at: daysAgo(r.daysAgo) }
})), 'id')
await insert('member_distinctions', stamp([{ member_id: memberId[clerkId(0)], distinction_id: 'lantern-keeper', granted_by: clerkId(1), note: 'Three seasons of workshops.' }]), 'id')

// page content
const distinctionRules = [
  { id: 'lantern-keeper', label: 'Lantern Keeper', description: 'Three seasons with the hollow.', glyph: '🏮', engraving: 'Keeper', conditions: [{ fact: 'years_since_joined', op: 'gte', value: 3 }], enabled: true },
  { id: 'first-light', label: 'First Light', description: 'Approved, pictured, and part of a group.', glyph: '🌅', engraving: 'First Light', conditions: [{ fact: 'is_approved', op: 'is_true' }, { fact: 'has_photo', op: 'is_true' }, { fact: 'group_count', op: 'gte', value: 1 }], enabled: true },
]
await insert('page_content', stamp(Object.entries({
  ...C.PAGE_COPY,
  config_event_start_date: C.COMMUNITY.eventStart,
  config_event_end_date: C.COMMUNITY.eventEnd,
  config_attunement_nudge_days: '0',
  config_shift_signup_open: 'true',
  config_dues: JSON.stringify({ enabled: true, audience: { members: true, volunteers: false }, paymentEmail: 'dues@example.org', mode: 'sliding', amount: '', minAmount: '$40', maxAmount: '$120', instructions: 'E-transfer with your name in the memo. Pay what fits your season.' }),
  config_distinctions: JSON.stringify(distinctionRules),
}).map(([key, value]) => ({ key, value }))), 'key')

console.log(`\n${DRY ? 'would insert' : 'inserted'} ${inserted} rows for ${C.COMMUNITY.name}${ORGANIZERS.length ? ` (+ organizers ${ORGANIZERS.join(', ')})` : ''}`)
console.log(`hosts: ${C.COMMUNITY.hosts.join(', ')}`)
console.log('local: run the dev server, then open http://' + C.COMMUNITY.hosts[0] + '/ (Glåüm stays on localhost)')

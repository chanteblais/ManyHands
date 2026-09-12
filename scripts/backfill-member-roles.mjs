#!/usr/bin/env node
// One-off for multi-tenancy branch 1d: copy the Clerk-instance-wide admin /
// poll-manager flags (publicMetadata.role === 'admin', .canManagePolls) into
// the community-scoped columns on `members` (role, can_manage_polls — added by
// migration 074), and optionally mark the platform owner.
//
//   node scripts/backfill-member-roles.mjs                 # dry run: prints the plan
//   node scripts/backfill-member-roles.mjs --execute       # writes members rows
//   node scripts/backfill-member-roles.mjs --execute --owner=you@example.com
//        # also sets publicMetadata.platformRole = 'owner' on that Clerk user
//
// RUN THIS BEFORE deploying 1d: from that deploy on, admin is read from
// members.role and nothing reads publicMetadata.role — an unbackfilled admin is
// locked out (the platform owner never is).
//
// Clerk instance: members.clerk_user_id holds PRODUCTION ids (migration 059),
// so this reads the prod instance — CLERK_SECRET_KEY_PROD (sk_live_) from
// .env.local, falling back to CLERK_SECRET_KEY when that is itself sk_live_.
// Supabase: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const EXECUTE = process.argv.includes('--execute')
const OWNER = (process.argv.find(a => a.startsWith('--owner=')) ?? '').slice('--owner='.length).trim().toLowerCase()
const COMMUNITY_SLUG = (process.argv.find(a => a.startsWith('--community=')) ?? '--community=glaum').slice('--community='.length)

function envVar(name) {
  const line = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split('\n').find(l => l.startsWith(name + '='))
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : null
}

const prodKey = envVar('CLERK_SECRET_KEY_PROD')
const anyKey = envVar('CLERK_SECRET_KEY')
const CLERK_KEY = prodKey?.startsWith('sk_live_') ? prodKey : anyKey?.startsWith('sk_live_') ? anyKey : null
if (!CLERK_KEY) throw new Error('Need an sk_live_ Clerk key: CLERK_SECRET_KEY_PROD (or CLERK_SECRET_KEY) in .env.local')

const supabase = createClient(envVar('NEXT_PUBLIC_SUPABASE_URL'), envVar('SUPABASE_SERVICE_ROLE_KEY'))

async function clerk(pathName, init = {}) {
  const res = await fetch('https://api.clerk.com/v1' + pathName, {
    ...init,
    headers: { Authorization: `Bearer ${CLERK_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`Clerk ${init.method ?? 'GET'} ${pathName} → ${res.status} ${await res.text()}`)
  return res.json()
}

async function listAllUsers() {
  const users = []
  for (let offset = 0; ; offset += 100) {
    const page = await clerk(`/users?limit=100&offset=${offset}`)
    users.push(...page)
    if (page.length < 100) break
  }
  return users
}

const { data: community, error: cErr } = await supabase.from('communities').select('id, slug').eq('slug', COMMUNITY_SLUG).maybeSingle()
if (cErr || !community) throw new Error(`community "${COMMUNITY_SLUG}" not found (${cErr?.message ?? 'no row'})`)

const users = await listAllUsers()
const flagged = users
  .map(u => ({
    id: u.id,
    email: (u.email_addresses ?? []).find(e => e.id === u.primary_email_address_id)?.email_address ?? u.email_addresses?.[0]?.email_address ?? '',
    admin: u.public_metadata?.role === 'admin',
    polls: u.public_metadata?.canManagePolls === true,
  }))
  .filter(u => u.admin || u.polls)

const { data: members, error: mErr } = await supabase
  .from('members').select('id, clerk_user_id, email, role, can_manage_polls').eq('community_id', community.id)
if (mErr) throw mErr
const byClerkId = new Map(members.filter(m => m.clerk_user_id).map(m => [m.clerk_user_id, m]))

const plan = []
const unmatched = []
for (const u of flagged) {
  const m = byClerkId.get(u.id)
  if (!m) { unmatched.push(u); continue }
  const role = u.admin ? 'admin' : m.role
  const can_manage_polls = u.polls || m.can_manage_polls
  if (role !== m.role || can_manage_polls !== m.can_manage_polls) plan.push({ member: m, role, can_manage_polls, email: u.email })
}

console.log(`Clerk instance: ${CLERK_KEY.slice(0, 11)}… (${users.length} users) · community: ${community.slug}`)
console.log(`Flagged in Clerk: ${flagged.length} (admin ${flagged.filter(u => u.admin).length}, poll managers ${flagged.filter(u => u.polls).length})`)
console.log(`Member rows to update: ${plan.length}`)
for (const p of plan) console.log(`  ${p.email.padEnd(36)} role=${p.role} can_manage_polls=${p.can_manage_polls}`)
if (unmatched.length) {
  console.log(`No member row in this community for ${unmatched.length} flagged user(s):`)
  for (const u of unmatched) console.log(`  ${u.email} (${u.id})`)
}
const ownerUser = OWNER ? users.find(u => (u.email_addresses ?? []).some(e => e.email_address.toLowerCase() === OWNER)) : null
if (OWNER) console.log(ownerUser ? `Platform owner: ${OWNER} (${ownerUser.id})` : `Platform owner NOT FOUND in Clerk: ${OWNER}`)

if (!EXECUTE) { console.log('\nDry run — pass --execute to apply.'); process.exit(0) }

for (const p of plan) {
  const { error } = await supabase.from('members')
    .update({ role: p.role, can_manage_polls: p.can_manage_polls, updated_at: new Date().toISOString() })
    .eq('id', p.member.id)
  if (error) throw error
}
if (ownerUser) {
  // Clerk shallow-merges public_metadata; role/canManagePolls stay untouched.
  await clerk(`/users/${ownerUser.id}/metadata`, { method: 'PATCH', body: JSON.stringify({ public_metadata: { platformRole: 'owner' } }) })
}
console.log(`\nApplied: ${plan.length} member row(s)${ownerUser ? ', platform owner set' : ''}.`)

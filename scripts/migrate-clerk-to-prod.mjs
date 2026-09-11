#!/usr/bin/env node
// Migrate the community from the Clerk DEV instance (sweet-lionfish-23) to the
// PRODUCTION instance, in two artifacts:
//
//   1. Creates each dev user in the prod instance (same email, name,
//      publicMetadata — role/canManagePolls carry over). Idempotent: users
//      already present in prod (matched by primary email) are reused, never
//      duplicated.
//   2. Emits supabase-migrations/059_clerk_prod_remap.sql — a transaction that
//      remaps every Clerk-ID column in Supabase from old (dev) to new (prod)
//      IDs, including the derived conversations.direct_key. Chanté applies it
//      herself, then swaps the Vercel env keys and redeploys.
//
// DRY RUN by default — prints an aggregate plan and writes nothing to Clerk.
// Pass --execute to create the prod users and write the SQL file.
//
// Requires in .env.local (the durable local setup — localhost always runs
// against the dev instance, so the dev pair stays primary):
//   CLERK_SECRET_KEY       = sk_test_…  (dev instance — the normal local key)
//   CLERK_SECRET_KEY_PROD  = sk_live_…  (prod instance — used only by this script)
//
// The full mapping (with emails, for eyeballing) is written to
// scripts/clerk-id-map.json — local only, gitignored, never printed.

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const EXECUTE = process.argv.includes('--execute')

function envVar(name) {
  const line = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split('\n').find(l => l.startsWith(name + '='))
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : null
}

const DEV_KEY = envVar('CLERK_SECRET_KEY')
const PROD_KEY = envVar('CLERK_SECRET_KEY_PROD')
if (!DEV_KEY?.startsWith('sk_test_')) throw new Error('CLERK_SECRET_KEY must be the sk_test_ dev key (localhost runs on the dev instance)')
if (!PROD_KEY?.startsWith('sk_live_')) throw new Error('CLERK_SECRET_KEY_PROD missing or not an sk_live_ key')

async function clerk(key, method, pathName, body) {
  const res = await fetch('https://api.clerk.com/v1' + pathName, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${method} ${pathName} → ${res.status}: ${JSON.stringify(json).slice(0, 300)}`)
  return json
}

async function allUsers(key) {
  const users = []
  for (let offset = 0; ; offset += 100) {
    const page = await clerk(key, 'GET', `/users?limit=100&offset=${offset}`)
    users.push(...page)
    if (page.length < 100) break
  }
  return users
}

const primaryEmail = u => {
  const primary = u.email_addresses?.find(e => e.id === u.primary_email_address_id)
  return (primary ?? u.email_addresses?.[0])?.email_address?.toLowerCase() ?? null
}

// ── Plan ────────────────────────────────────────────────────────────────────
const devUsers = await allUsers(DEV_KEY)
const prodUsers = await allUsers(PROD_KEY)
const prodByEmail = new Map(prodUsers.map(u => [primaryEmail(u), u]).filter(([e]) => e))

const plan = devUsers.map(u => {
  const email = primaryEmail(u)
  const existing = email ? prodByEmail.get(email) : undefined
  return { old_id: u.id, email, first_name: u.first_name, last_name: u.last_name,
           public_metadata: u.public_metadata ?? {}, action: existing ? 'reuse' : 'create',
           new_id: existing?.id ?? null }
})

const noEmail = plan.filter(p => !p.email)
console.log(`dev users: ${devUsers.length} · prod users: ${prodUsers.length}`)
console.log(`to create in prod: ${plan.filter(p => p.action === 'create' && p.email).length}`)
console.log(`already in prod (reused by email): ${plan.filter(p => p.action === 'reuse').length}`)
console.log(`carrying admin role: ${plan.filter(p => p.public_metadata.role === 'admin').length}`)
console.log(`carrying canManagePolls: ${plan.filter(p => p.public_metadata.canManagePolls === true).length}`)
if (noEmail.length) console.warn(`⚠ ${noEmail.length} dev user(s) have NO email — cannot migrate: ${noEmail.map(p => p.old_id).join(', ')}`)

if (!EXECUTE) {
  fs.writeFileSync(path.join(ROOT, 'scripts/clerk-id-map.json'), JSON.stringify(plan, null, 2))
  console.log('\nDRY RUN — nothing written to Clerk. Full plan (incl. emails) in scripts/clerk-id-map.json')
  console.log('Re-run with --execute to create the prod users and emit the remap SQL.')
  process.exit(0)
}

// ── Execute: create missing prod users ──────────────────────────────────────
for (const p of plan) {
  if (!p.email || p.new_id) continue
  const created = await clerk(PROD_KEY, 'POST', '/users', {
    email_address: [p.email],
    first_name: p.first_name ?? undefined,
    last_name: p.last_name ?? undefined,
    public_metadata: p.public_metadata,
    skip_password_requirement: true, // members sign in with email codes
  })
  p.new_id = created.id
  console.log(`created prod user for ${p.old_id} → ${p.new_id}`)
}

fs.writeFileSync(path.join(ROOT, 'scripts/clerk-id-map.json'), JSON.stringify(plan, null, 2))

// ── Emit the remap SQL ──────────────────────────────────────────────────────
const mapped = plan.filter(p => p.old_id && p.new_id)
const values = mapped.map(p => `  ('${p.old_id}', '${p.new_id}')`).join(',\n')

// Every table+column in Supabase that stores a Clerk user ID
// (inventory from docs/database.md, 2026-07-03).
const SIMPLE = [
  ['applications', 'clerk_user_id'], ['members', 'clerk_user_id'], ['volunteers', 'clerk_user_id'],
  ['camp_signups', 'clerk_user_id'], ['group_members', 'clerk_user_id'], ['member_shift_signups', 'clerk_user_id'],
  ['user_notifications', 'clerk_user_id'], ['conversation_participants', 'clerk_user_id'],
  ['shoutouts', 'clerk_user_id'], ['role_suggestions', 'clerk_user_id'], ['attunement_nudges', 'clerk_user_id'],
  ['lead_up_event_rsvps', 'clerk_user_id'], ['resource_claims', 'clerk_user_id'], ['poll_votes', 'clerk_user_id'],
  ['member_distinctions', 'granted_by'], ['messages', 'sender_clerk_id'], ['messages', 'recipient_clerk_id'],
  ['resources', 'offered_by'],
]

const updates = SIMPLE.map(([t, c]) =>
  `UPDATE ${t} SET ${c} = m.new_id FROM _clerk_id_map_059 m WHERE ${t}.${c} = m.old_id;`
).join('\n')

const checks = SIMPLE.map(([t, c]) =>
  `SELECT '${t}.${c}' AS col, count(*) AS still_old FROM ${t} WHERE ${c} IN (SELECT old_id FROM _clerk_id_map_059)`
).join('\nUNION ALL\n')

const sql = `-- 059: Remap Clerk user IDs from the dev instance (sweet-lionfish-23) to the
-- production instance. Generated by scripts/migrate-clerk-to-prod.mjs.
-- NOT destructive (pure ID rewrite); re-runnable — rows already remapped no
-- longer match old_id. Run during the cutover window, right before the Vercel
-- key swap. No TEMP table / explicit transaction — the Supabase SQL editor
-- doesn't carry those across statements; the helper table is real and dropped
-- in a follow-up statement AFTER the verification counts read all zeros.

CREATE TABLE IF NOT EXISTS _clerk_id_map_059 (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL UNIQUE);
INSERT INTO _clerk_id_map_059 (old_id, new_id) VALUES
${values}
ON CONFLICT (old_id) DO NOTHING;

${updates}

-- conversations.direct_key = the two clerk ids sorted + '|'-joined; remap both
-- halves and re-sort. Unmapped halves (deleted users) pass through unchanged.
UPDATE conversations c SET direct_key = sub.new_key
FROM (
  SELECT c2.id,
         (SELECT string_agg(COALESCE(m.new_id, t.part), '|' ORDER BY COALESCE(m.new_id, t.part))
          FROM unnest(string_to_array(c2.direct_key, '|')) AS t(part)
          LEFT JOIN _clerk_id_map_059 m ON m.old_id = t.part) AS new_key
  FROM conversations c2
  WHERE c2.direct_key IS NOT NULL
) sub
WHERE c.id = sub.id AND c.direct_key IS DISTINCT FROM sub.new_key;

-- Verification (last statement, so the editor shows it): every row must be 0.
-- Once it is, run:  DROP TABLE _clerk_id_map_059;
${checks};
`

const out = path.join(ROOT, 'supabase-migrations/059_clerk_prod_remap.sql')
fs.writeFileSync(out, sql)
console.log(`\nwrote ${out} (${mapped.length} mappings)`)
console.log('Next: apply the SQL in Supabase, then swap Vercel keys + redeploy.')

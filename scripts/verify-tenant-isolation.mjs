#!/usr/bin/env node
// Leak test for the RLS belt (multi-tenancy 1e, migration 076). Run locally
// with SUPABASE_JWT_SECRET in .env.local BEFORE adding that secret to Vercel:
//
//   node scripts/verify-tenant-isolation.mjs
//
// Asserts, against the live database:
//   1. a token for the real community sees its rows (policies admit them)
//   2. a token for a random community id sees ZERO rows on every scoped table,
//      even with no filter at all (the leak that RLS exists to stop)
//   3. the public anon key sees nothing
//   4. claim_shift_signup() is callable as `authenticated` (grant from 076)
// Exit code 1 on any failure. Read-only: no writes.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
function envVar(name) {
  const line = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n').find(l => l.startsWith(name + '='))
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : null
}
const URL_ = envVar('NEXT_PUBLIC_SUPABASE_URL')
const ANON = envVar('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const SERVICE = envVar('SUPABASE_SERVICE_ROLE_KEY')
const SECRET = envVar('SUPABASE_JWT_SECRET')
if (!SECRET) { console.error('SUPABASE_JWT_SECRET is not in .env.local — nothing to verify yet.'); process.exit(1) }

const b64 = s => Buffer.from(s).toString('base64url')
function mint(communityId) {
  const iat = Math.floor(Date.now() / 1000)
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const claims = b64(JSON.stringify({ role: 'authenticated', aud: 'authenticated', iss: 'many-hands', sub: 'verify', community_id: communityId, iat, exp: iat + 600 }))
  const sig = b64(crypto.createHmac('sha256', SECRET).update(`${header}.${claims}`).digest())
  return `${header}.${claims}.${sig}`
}
const asToken = token => createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })

const SCOPED = ['applications','members','member_profiles','member_distinctions','volunteers','departments','roles','group_collections','groups','group_members','schedule_events','shift_types','member_shift_signups','camp_signups','event_rsvps','admin_notifications','user_notifications','announcements','radio_events','page_content','messages','conversations','conversation_participants','shoutouts','role_suggestions','attunement_nudges','event_reminders_sent','lead_up_events','lead_up_event_rsvps','resource_lists','resources','resource_claims','polls','poll_votes']

const service = createClient(URL_, SERVICE)
const { data: community } = await service.from('communities').select('id, slug').order('created_at').limit(1).single()
const real = asToken(mint(community.id))
const stranger = asToken(mint(crypto.randomUUID()))
const anon = createClient(URL_, ANON)

let failures = 0
const fail = msg => { failures++; console.log('  ✗ ' + msg) }

console.log(`community under test: ${community.slug} (${community.id})\n`)
for (const t of SCOPED) {
  const [{ count: truth }, { data: seen, error: e1 }, { data: leaked, error: e2 }, { data: pub }] = await Promise.all([
    service.from(t).select('*', { count: 'exact', head: true }).eq('community_id', community.id),
    real.from(t).select('community_id').limit(1000),
    stranger.from(t).select('community_id').limit(1000),   // NO filter — the leak test
    anon.from(t).select('community_id').limit(1),
  ])
  if (e1) fail(`${t}: real-community token errored: ${e1.message}`)
  else if ((truth ?? 0) > 0 && (seen?.length ?? 0) === 0) fail(`${t}: real-community token sees 0 of ${truth} rows (missing policy or grant)`)
  if (e2 && !/permission denied/i.test(e2.message)) fail(`${t}: stranger token errored unexpectedly: ${e2.message}`)
  if ((leaked?.length ?? 0) > 0) fail(`${t}: LEAK — stranger token read ${leaked.length} row(s)`)
  if ((pub?.length ?? 0) > 0) fail(`${t}: anon key read a row`)
}
console.log(`scoped tables: ${SCOPED.length} checked`)

const rpc = await real.rpc('claim_shift_signup', { p_clerk_user_id: 'verify', p_schedule_event_id: '00000000-0000-0000-0000-000000000000', p_occurrence_date: null, p_role: 'member' })
if (rpc.error) fail(`claim_shift_signup as authenticated: ${rpc.error.message}`)
else if (rpc.data !== 'not_found') fail(`claim_shift_signup returned ${rpc.data} for a bogus event (expected not_found)`)
else console.log('claim_shift_signup: callable as authenticated ✓')

const prefs = await real.from('notification_preferences').select('clerk_user_id').limit(1)
if (prefs.error) fail(`notification_preferences as authenticated: ${prefs.error.message}`)

if (failures) { console.log(`\n${failures} failure(s) — do NOT set SUPABASE_JWT_SECRET in Vercel yet.`); process.exit(1) }
console.log('\nAll isolation checks passed — safe to set SUPABASE_JWT_SECRET in Vercel.')

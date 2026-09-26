#!/usr/bin/env node
// Seed (or reseed) the fictional demo community — docs/business.md → Showcase
// & demo strategy; docs/tenancy-design.md → tenant 2 rehearsal. Content lives
// in scripts/seed-demo/content.mjs, the seeding itself in scripts/seed-demo/seed.mjs
// (shared with the nightly reset cron, app/api/cron/demo-reset).
//
//   node scripts/seed-demo-community.mjs --dry-run              # validate + plan, no writes
//   node scripts/seed-demo-community.mjs                        # create (fails if the community already has rows)
//   node scripts/seed-demo-community.mjs --reset                # wipe the demo community's rows + avatars, then seed
//                                                              #   (existing organizer rows carry over)
//   … --organizer=user_a,user_b   also give those real Clerk users an approved ADMIN member row each
//                                (pass both your prod and dev-instance ids: localhost signs into the dev instance)
//   … --no-avatars           skip uploading the portraits (scripts/seed-demo/avatars/)
//
// Writes ONLY rows carrying the demo community's id (every insert stamps it),
// plus avatar objects under `<community_id>/…` in the `avatars` bucket. Uses
// the service-role key (bypasses RLS) like the other maintenance scripts.
// Idempotent with --reset. Never touches any other community.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import * as C from './seed-demo/content.mjs'
import { seedDemoCommunity } from './seed-demo/seed.mjs'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
process.chdir(ROOT) // seed.mjs reads the portraits relative to the repo root
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

const { inserted, organizers } = await seedDemoCommunity(supabase, { reset: RESET, dryRun: DRY, avatars: AVATARS, organizers: ORGANIZERS })

console.log(`\n${DRY ? 'would insert' : 'inserted'} ${inserted} rows for ${C.COMMUNITY.name}${organizers.length ? ` (+ organizers ${organizers.join(', ')})` : ''}`)
console.log(`hosts: ${C.COMMUNITY.hosts.join(', ')}`)
console.log('local: run the dev server, then open http://' + C.COMMUNITY.hosts[0] + '/ (Glåüm stays on localhost)')

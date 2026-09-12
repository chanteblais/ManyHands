#!/usr/bin/env node
// Tenant-scope guard (docs/tenancy-design.md §3). Part of `npm run check`.
//
// Feature code must reach the database through `tenantDb(community.id)`
// (lib/tenant-db.ts), which pins every read and write to one community. This
// script fails on any file under app/, lib/ or components/ that imports the
// raw service-role client from '@/lib/supabase' unless the file is listed in
// scripts/tenant-scope-allowlist.txt — the set of files still waiting for the
// sweep (branches 1b–1d). The allowlist may only shrink: a listed file that no
// longer imports the raw client is reported as stale so the list stays honest,
// and when it is empty the guard is simply "no raw client outside EXEMPT".
//
// EXEMPT files own the raw client by design.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SCAN_DIRS = ['app', 'lib', 'components']
const ALLOWLIST_PATH = 'scripts/tenant-scope-allowlist.txt'
const EXEMPT = new Set([
  'lib/supabase.ts',      // the client itself
  'lib/tenant-db.ts',     // the scoped wrapper
  'lib/community.ts',     // tenant resolution (reads `communities`, `members`)
])
// Alias or relative: '@/lib/supabase', './supabase', '../lib/supabase', …
const RAW_IMPORT = /from\s+['"](?:@\/lib\/supabase|(?:\.{1,2}\/)+(?:lib\/)?supabase)['"]/

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

const allowlist = new Set(
  existsSync(ALLOWLIST_PATH)
    ? readFileSync(ALLOWLIST_PATH, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    : [],
)

const rawUsers = new Set()
for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    if (EXEMPT.has(file)) continue
    if (RAW_IMPORT.test(readFileSync(file, 'utf8'))) rawUsers.add(file)
  }
}

const failures = []
for (const file of rawUsers) {
  if (!allowlist.has(file)) {
    failures.push(`${file}: imports the raw supabase client — use tenantDb(community.id) from lib/tenant-db.ts (or, if this file is mid-sweep, add it to ${ALLOWLIST_PATH})`)
  }
}
for (const file of allowlist) {
  if (!rawUsers.has(file)) {
    failures.push(`${file}: allowlisted but no longer imports the raw client — remove it from ${ALLOWLIST_PATH}`)
  }
}

if (failures.length) {
  console.error(`tenant-scope guard: ${failures.length} failure(s)\n`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`tenant-scope guard: ${rawUsers.size} file(s) still on the raw client (all allowlisted), 0 new`)

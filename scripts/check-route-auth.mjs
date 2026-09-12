#!/usr/bin/env node
// Static auth-matrix audit (2026-08-27 security review follow-up).
// Runs in CI and via `npm run check`. Backend routes use the Supabase
// service-role key, so authorization lives in the handlers — a route that
// forgets its gate is privileged-by-default. This asserts every
// app/api/**/route.ts shows evidence of a gate, and that /api/admin routes use
// an admin-tier gate specifically.
//
// Heuristic and file-level by design (it can't see a gate skipped in one
// exported method) — the proxy.ts admin wall covers /admin + /api/admin
// wholesale, so the two layers back each other up. A false failure means the
// route uses a new gate helper: add its pattern to GATES rather than
// allowlisting the route.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const GATES = [
  { name: 'requireAdmin', admin: true, re: /\brequireAdmin\s*\(/ },
  { name: 'requirePollManager', admin: true, re: /\brequirePollManager\s*\(/ },
  { name: 'cron secret', admin: true, re: /CRON_SECRET/ },
  { name: 'clerk auth()', admin: false, re: /\bawait auth\s*\(\)/ },
]

// Intentionally public routes, relative paths from the repo root. Add one ONLY
// with a comment saying why it's public and the date that was reviewed.
const PUBLIC_ROUTES = new Set([
  // Public community directory: names/descriptions that already appear on each
  // community's public home page; no member data. Reviewed 2026-09-12.
  'app/api/communities/route.ts',
])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name === 'route.ts') out.push(p)
  }
  return out
}

const failures = []
const routes = walk('app/api')
for (const file of routes) {
  const src = readFileSync(file, 'utf8')
  const hits = GATES.filter(g => g.re.test(src))

  if (PUBLIC_ROUTES.has(file)) {
    if (hits.length) failures.push(`${file}: allowlisted as public but contains a gate (${hits.map(g => g.name).join(', ')}) — remove it from PUBLIC_ROUTES`)
    continue
  }
  if (hits.length === 0) {
    failures.push(`${file}: no auth gate found — gate it, or allowlist it in scripts/check-route-auth.mjs with a reason`)
    continue
  }
  if (file.startsWith(join('app/api/admin') + '/') && !hits.some(g => g.admin)) {
    failures.push(`${file}: under /api/admin but only gated by ${hits.map(g => g.name).join(', ')} — use requireAdmin()`)
  }
}

if (failures.length) {
  console.error(`route-auth audit: ${failures.length} failure(s) across ${routes.length} routes\n`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log(`route-auth audit: ${routes.length} routes checked, all gated`)

#!/usr/bin/env node
// One-off (2026-09-25): give every existing `avatar.webp` in the `avatars`
// bucket its 256px `avatar.thumb.webp` sibling (lib/avatar-thumb.mjs). New
// uploads, the demo seed and demo guests write one themselves; this covers
// avatars stored before that. Run it BEFORE deploying the code that points
// small avatars at thumbnails, or those avatars show broken until it runs.
//
// Walks both layouts: `<community_id>/<userId>/avatar.webp` and the
// pre-tenancy `<userId>/avatar.webp`. Skips folders that already have a
// thumbnail unless --force. GIF avatars get none (they keep their animation).
//
// DRY RUN by default. Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
//   node scripts/backfill-avatar-thumbs.mjs            # dry run
//   node scripts/backfill-avatar-thumbs.mjs --execute  # write thumbnails

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { avatarThumbPath } from '../lib/avatar-thumb.mjs'
import { makeAvatarThumb } from '../lib/avatar-thumb-server.mjs'

dotenv.config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const EXECUTE = process.argv.includes('--execute')
const FORCE = process.argv.includes('--force')
const bucket = createClient(url, key).storage.from('avatars')
const kb = (n) => `${Math.round(n / 1024)}KB`

async function list(prefix) {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(prefix, { limit: 1000, offset })
    if (error) throw new Error(`list ${prefix || '/'}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

// Depth-first: a folder holding avatar.webp is a user folder; any other
// folder (a community id) is descended into.
async function walk(prefix, stats) {
  const entries = await list(prefix)
  const names = new Set(entries.filter(e => e.id).map(e => e.name))
  if (names.has('avatar.webp')) {
    const p = `${prefix}/avatar.webp`
    const thumb = avatarThumbPath(p)
    if (names.has('avatar.thumb.webp') && !FORCE) { stats.skipped++; return }
    const { data, error } = await bucket.download(p)
    if (error) throw new Error(`download ${p}: ${error.message}`)
    const src = Buffer.from(await data.arrayBuffer())
    const out = await makeAvatarThumb(src)
    console.log(`${EXECUTE ? 'WRITE' : 'PLAN '} ${thumb}  ${kb(src.length)} → ${kb(out.length)}`)
    if (EXECUTE) {
      const { error: upErr } = await bucket.upload(thumb, out, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
      if (upErr) throw new Error(`upload ${thumb}: ${upErr.message}`)
    }
    stats.done++
    return
  }
  for (const e of entries) if (!e.id) await walk(prefix ? `${prefix}/${e.name}` : e.name, stats)
}

const stats = { done: 0, skipped: 0 }
await walk('', stats)
console.log(`\n${EXECUTE ? 'Wrote' : 'Would write'} ${stats.done} thumbnail(s); ${stats.skipped} already had one.${EXECUTE ? '' : ' Pass --execute to apply.'}`)

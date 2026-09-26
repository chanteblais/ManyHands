// Rewrites a public Supabase Storage URL to the on-the-fly image-transform
// endpoint (render/image) so avatars ship at display size (~5-15KB) instead of
// the full upload (often 1-2MB).
//
// OPT-IN (2026-09-12): Supabase's image transformations are a plan feature —
// when the project doesn't have it, every render/image URL answers
// 403 {"code":"FeatureNotEnabled"} and each avatar shows as a broken image
// (found in production the day the platform went multi-host). So Supabase
// transforms are only used when NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS=true.
// Otherwise (2026-09-25) storage URLs go through Next's own optimizer
// (/_next/image — Vercel resizes, re-encodes to WebP/AVIF and caches at the
// edge). Returning the originals, as 09-12 did, shipped ~5MB of ≤1024px
// avatars to the /members grid's 80px circles and ~1MB PNG group icons.
//
// Two hard-won gotchas live here:
// · Any existing query string (the `?v=` mtime cache-buster from uploads) must
//   be split off the object path and re-appended as extra params — leaving it
//   inline swallows the width/quality params into the `v` value and silently
//   serves the full-size original.
// · `resize=cover` needs BOTH dimensions: with height omitted, Supabase fills
//   a width×(original height) box — i.e. a full-height sliver cropped out of
//   the middle of the photo, not a thumbnail. Every call site is a circle (or
//   square) with CSS object-fit: cover, so height defaults to width.
//
// AVATARS SKIP ALL OF THIS (2026-09-25): an `avatars/…/avatar.webp` has a
// pre-made 256px `avatar.thumb.webp` sibling (lib/avatar-thumb.mjs), so
// requests up to that size get the thumbnail and larger ones the stored
// ≤1024px original — both plain CDN files, nothing resized per request.
// GIF avatars (animated, no thumbnail) still take the paths below.
import { AVATAR_THUMB_SIZE, avatarThumbPath } from './avatar-thumb.mjs'

const TRANSFORMS_ENABLED = process.env.NEXT_PUBLIC_SUPABASE_IMAGE_TRANSFORMS === 'true'

export function supabaseResizedUrl(url: string | null, width: number, height: number = width): string | null {
  if (!url) return null
  const match = url.match(/\/storage\/v1\/object\/public\/([^?]+)(?:\?(.*))?$/)
  if (!match) return url
  if (match[1].startsWith('avatars/')) {
    const thumb = avatarThumbPath(url)
    if (thumb) return Math.max(width, height) <= AVATAR_THUMB_SIZE ? thumb : url
  }
  if (!TRANSFORMS_ENABLED) return nextOptimizedUrl(url, Math.max(width, height))
  const base = url.split('/storage/v1/object/public/')[0]
  const existingQuery = match[2] ? `&${match[2]}` : ''
  return `${base}/storage/v1/render/image/public/${match[1]}?width=${width}&height=${height}&quality=80&resize=cover${existingQuery}`
}

// Next's optimizer only accepts widths from images.deviceSizes ∪ imageSizes
// (defaults below — keep in sync with next.config.js if those are ever set)
// and a quality from images.qualities; the Supabase host must be in
// images.remotePatterns. It keeps the aspect ratio (no crop) — every call site
// crops with CSS object-fit: cover, so sizing by the larger side is enough.
const NEXT_IMAGE_WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840]

function nextOptimizedUrl(url: string, size: number): string {
  const w = NEXT_IMAGE_WIDTHS.find(n => n >= size) ?? NEXT_IMAGE_WIDTHS[NEXT_IMAGE_WIDTHS.length - 1]
  return `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`
}

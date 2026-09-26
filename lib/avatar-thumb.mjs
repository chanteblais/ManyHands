// Avatar thumbnails (2026-09-25): every stored `…/avatar.webp` gets a sibling
// `…/avatar.thumb.webp` — a 256px square — written at upload time. Small
// avatars (grid circles, inbox, header, widgets) load that file straight from
// Supabase's CDN, so nothing is resized when a page loads. Resizing on
// request (Vercel's /_next/image) cost 400–600ms per avatar on every cold
// cache, and a quiet demo is always cold.
//
// Pure (no sharp) so the client bundle can import it via lib/supabase-image.ts;
// the encoder lives in lib/avatar-thumb-server.mjs. Plain .mjs so the demo
// seed (run by node directly) shares it too.

/** Thumbnail edge in px — covers every call site up to 128px at 2× density. */
export const AVATAR_THUMB_SIZE = 256

/**
 * The thumbnail object path for an avatar path/URL ending in `avatar.webp`
 * (any query string kept), or null — GIF avatars keep their animation and
 * have no thumbnail.
 * @param {string} p
 * @returns {string | null}
 */
export function avatarThumbPath(p) {
  const m = p.match(/^(.*\/avatar)\.webp(\?.*)?$/)
  return m ? `${m[1]}.thumb.webp${m[2] ?? ''}` : null
}

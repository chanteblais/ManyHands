import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { BADGE_BASE_PATH, getBadgeBaseMtime } from '@/lib/badge-version'
import { getCommunityBySlug, listCommunities, DEFAULT_COMMUNITY_SLUG, type Community } from '@/lib/community'

export const runtime = 'nodejs'

// Unauthenticated (it renders an OG-style image), so the community can't come
// from a session: `?c=<slug>` names it, defaulting to DEFAULT_COMMUNITY_SLUG.
// Assets come from `communities.theme.badge` when set —
//   { base_url, font_url, width, height, font_name? }
// — else the repo's Glåüm defaults (public/badge_base.png + TokyoDreams, whose
// art is 365×424). Everything below is cached per community slug.

type BadgeAssets = { badgeBuffer: Buffer; fontBuffer: Buffer; width: number; height: number; fontName: string; version: string }

const DEFAULT_W = 365
const DEFAULT_H = 424

function themeBadge(community: Community): { base_url: string; font_url: string; width: number; height: number; font_name: string } | null {
  const b = community.theme.badge
  if (!b || typeof b !== 'object') return null
  const o = b as Record<string, unknown>
  if (typeof o.base_url !== 'string' || typeof o.font_url !== 'string') return null
  const width = typeof o.width === 'number' && o.width > 0 ? o.width : DEFAULT_W
  const height = typeof o.height === 'number' && o.height > 0 ? o.height : DEFAULT_H
  return { base_url: o.base_url, font_url: o.font_url, width, height, font_name: typeof o.font_name === 'string' ? o.font_name : 'BadgeFont' }
}

// Per-community asset + render caches (one server instance).
const assetCache = new Map<string, BadgeAssets>()
const renderCache = new Map<string, Buffer>() // `${slug}::${role}__${dept}`

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: 'force-cache' })
  if (!res.ok) throw new Error(`badge asset ${url} → ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function getAssets(community: Community): Promise<BadgeAssets> {
  const remote = themeBadge(community)
  // Version: remote assets are content-addressed by their URLs; the local base
  // is re-read when public/badge_base.png changes (mtime), so a swapped base
  // image picks up without a server restart.
  const version = remote ? `${remote.base_url}|${remote.font_url}` : String(await getBadgeBaseMtime())
  const cached = assetCache.get(community.slug)
  if (cached && cached.version === version) return cached

  const assets: BadgeAssets = remote
    ? {
        badgeBuffer: await fetchBuffer(remote.base_url),
        fontBuffer: await fetchBuffer(remote.font_url),
        width: remote.width, height: remote.height, fontName: remote.font_name, version,
      }
    : {
        badgeBuffer: await readFile(BADGE_BASE_PATH),
        fontBuffer: await readFile(path.join(process.cwd(), 'public/fonts/TokyoDreams.otf')),
        width: DEFAULT_W, height: DEFAULT_H, fontName: 'TokyoDreams', version,
      }
  assetCache.set(community.slug, assets)
  for (const key of Array.from(renderCache.keys())) if (key.startsWith(`${community.slug}::`)) renderCache.delete(key) // art changed — drop stale renders
  return assets
}

// Simulate word-wrap and find the largest font size that fits both width and height
function fitFontSize(
  text: string,
  zoneW: number, zoneH: number,
  lineHeightRatio: number,
  basePx: number, minPx: number,
): number {
  const CHAR_RATIO = 0.88 // conservative char-width/font-size for uppercase display fonts + letter-spacing

  for (let size = basePx; size >= minPx; size--) {
    const charW = size * CHAR_RATIO
    const lineH = size * lineHeightRatio

    // Simulate wrapping at spaces
    const words = text.toUpperCase().split(' ')
    let lines = 1
    let currentW = 0
    let fits = true

    for (const word of words) {
      const wordW = word.length * charW
      if (wordW > zoneW) { fits = false; break } // single word too wide
      if (currentW === 0) {
        currentW = wordW
      } else if (currentW + charW + wordW <= zoneW) {
        currentW += charW + wordW // space + word
      } else {
        lines++
        currentW = wordW
      }
    }

    if (!fits) continue
    if (lines * lineH <= zoneH) return size
  }
  return minPx
}

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
  'Content-Type': 'image/png',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role') ?? ''
  const dept = searchParams.get('dept') ?? ''
  const slug = searchParams.get('c') ?? DEFAULT_COMMUNITY_SLUG

  const community = (await getCommunityBySlug(slug)) ?? (await listCommunities())[0]
  if (!community) return new Response('No community', { status: 404 })

  // getAssets() first: re-reads the base and clears the render cache if the art
  // changed, so the lookup below never returns a badge built on stale art.
  const { badgeBuffer, fontBuffer, width, height, fontName } = await getAssets(community)

  const cacheKey = `${community.slug}::${role}__${dept}`
  const cached = renderCache.get(cacheKey)
  if (cached) {
    return new Response(cached.buffer as ArrayBuffer, { headers: CACHE_HEADERS })
  }
  const badgeDataUrl = `data:image/png;base64,${badgeBuffer.toString('base64')}`

  // Render at 2× for crisp text when downscaled for display. The frame must
  // match the base art's aspect ratio — the art is drawn with fixed dimensions
  // and no aspect preservation, so a mismatched frame stretches it. Zones
  // below are laid out on the 365×424 reference and scaled with the art.
  const SCALE = 2
  const W = width * SCALE
  const H = height * SCALE
  const sx = (n: number) => (n / DEFAULT_W) * width * SCALE
  const sy = (n: number) => (n / DEFAULT_H) * height * SCALE

  // Dept zone: 1x width=255, height=125 rendered but use 105 for fitting to guarantee breathing room
  const deptFontSize = fitFontSize(dept, 365 - 55 * 2, 105, 1.5, 24, 11)

  // Role zone: 1x height=122, effective fitting height=100 (22px breathing room top+bottom)
  // 4+ word roles use natural word-wrap (same as dept); shorter roles stack one word per line
  const roleWords = role.toUpperCase().split(' ')
  const isLongRole = roleWords.length >= 4
  const roleFontSize = (() => {
    const CHAR_RATIO = 0.88
    const zoneW = 365 - 42 * 2  // 281px
    const effectiveH = 100       // 122px zone minus 22px breathing room

    if (isLongRole) {
      // Natural wrapping — reuse fitFontSize word-wrap simulation
      return fitFontSize(role, zoneW, effectiveH, 1.3, 20, 11)
    }

    // One word per line — fit by longest word width & total stacked height
    const longestWord = Math.max(...roleWords.map(w => w.length))
    for (let size = 26; size >= 11; size--) {
      if (longestWord * size * CHAR_RATIO <= zoneW &&
          roleWords.length * size * 1.3 <= effectiveH) return size
    }
    return 11
  })()

  const imageResponse = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative' }}>
        {/* Badge background */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={badgeDataUrl} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }} alt="" />

        {/* Department name — upper zone, above gold divider */}
        <div style={{
          position: 'absolute',
          top: sy(135), left: sx(55), right: sx(55), height: sy(125),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <span style={{
            fontFamily: fontName,
            color: '#F5EDD8',
            fontSize: sy(deptFontSize),
            textAlign: 'center',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            lineHeight: 1.5,
            textShadow: '0 0 12px rgba(255,230,160,0.7), 0 1px 3px rgba(0,0,0,0.8)',
            wordBreak: 'break-word',
            maxWidth: '100%',
          }}>
            {dept}
          </span>
        </div>

        {/* Role name — lower zone */}
        <div style={{
          position: 'absolute',
          top: sy(258), left: sx(42), right: sx(42), height: sy(122),
          // flex row (no flexDirection) mirrors the dept zone — required for Satori text wrapping
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {isLongRole ? (
            // 4+ words: natural centered wrapping, same layout as dept zone
            <span style={{
              fontFamily: fontName,
              color: '#D4B050',
              fontSize: sy(roleFontSize),
              textAlign: 'center',
              letterSpacing: '0.1em',
              lineHeight: 1.3,
              textShadow: '0 0 16px rgba(220,170,60,0.75), 0 1px 3px rgba(0,0,0,0.9)',
              wordBreak: 'break-word',
              maxWidth: '100%',
            }}>
              {role.toUpperCase()}
            </span>
          ) : (
            // 1–3 words: one word per line stacking
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
              {roleWords.map((word, i) => (
                <span key={i} style={{
                  fontFamily: fontName,
                  color: '#D4B050',
                  fontSize: sy(roleFontSize),
                  textAlign: 'center',
                  letterSpacing: '0.1em',
                  lineHeight: 1.3,
                  textShadow: '0 0 16px rgba(220,170,60,0.75), 0 1px 3px rgba(0,0,0,0.9)',
                  display: 'block',
                }}>
                  {word}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [{ name: fontName, data: fontBuffer, style: 'normal' }],
    },
  )

  // Store in render cache for subsequent requests in this server instance
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
  renderCache.set(cacheKey, imageBuffer)

  return new Response(imageBuffer.buffer as ArrayBuffer, { headers: CACHE_HEADERS })
}

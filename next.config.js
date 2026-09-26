/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16's `next dev` writes AGENTS.md/CLAUDE.md at the repo root unless
  // disabled; agent guidance lives in docs/ here, so keep the tree clean.
  agentRules: false,
  // Local multi-tenant testing: the same `next dev` answers the demo
  // community on 127.0.0.1 / lantern.localhost (communities.hosts) while
  // localhost stays Glåüm. Dev-only — Next blocks its own chunk requests from
  // any origin not listed here, which renders as blank client pages.
  allowedDevOrigins: ['127.0.0.1', 'lantern.localhost', 'platform.localhost'],
  // The nightly demo reseed (scripts/seed-demo/seed.mjs) and guest entry
  // (lib/demo.ts) read the committed demo portraits from disk, so they must
  // ship with those functions.
  outputFileTracingIncludes: {
    '/api/cron/demo-reset': ['./scripts/seed-demo/avatars/**'],
    '/api/demo/enter': ['./scripts/seed-demo/guest-avatars/**'],
  },
  images: {
    // Non-default `quality` values must be allow-listed in Next 16.
    qualities: [50, 65, 75],
    // Member uploads (avatars, icon art) resize through /_next/image while
    // Supabase's own transforms are off — lib/supabase-image.ts.
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [{ protocol: 'https', hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, pathname: '/storage/v1/object/public/**' }]
      : [],
  },
  async headers() {
    return [
      // Versioned hands rasters (scripts/raster-hands.mjs bumps the filename
      // on regeneration) — safe to cache forever. Without this, public/ ships
      // max-age=0 and every navigation revalidates ~145KB of ornament.
      {
        source: '/:file(hands-.+\\.v\\d+\\.webp)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // Fonts are versioned filenames too (rename on change) — immutable.
      {
        source: '/fonts/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // Asset-library art is re-struck IN PLACE under stable names (the sw.js
      // v3 incident), so no immutable here: fresh within a day, served stale
      // while revalidating for a week.
      {
        source: '/asset-library/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ];
  },
  async redirects() {
    return [
      // The Participate page moved (2026-07-02); old links/bookmarks/emails
      // may still say /signup. (The Clerk /sign-up page is unrelated.)
      { source: '/signup', destination: '/participate', permanent: true },
    ];
  },
};

module.exports = nextConfig;

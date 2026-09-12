import { NextResponse } from 'next/server'
import { listDiscoverableCommunities } from '@/lib/community-directory'

export const dynamic = 'force-dynamic'

// Public community directory (docs/features.md → Communities picker): the
// discoverable communities and whether each is taking applications. Feeds the
// finder on /communities and, later, the shared app's "find a community".
// Deliberately public — every field is already on each community's own
// public home page — and reviewed as such 2026-09-12 (scripts/check-route-auth.mjs).
export async function GET() {
  const communities = await listDiscoverableCommunities()
  return NextResponse.json({ communities }, { headers: { 'Cache-Control': 'public, max-age=60' } })
}

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { listCommunities } from '@/lib/community'
import { tenantDb } from '@/lib/tenant-db'
import { pageContentTag } from '@/lib/page-content'
import { deleteDemoGuestUsers, isDemoCommunity } from '@/lib/demo'
// Plain-JS seed module shared with the CLI (scripts/seed-demo-community.mjs).
import { seedDemoCommunity, DEMO_SLUG } from '../../../../scripts/seed-demo/seed.mjs'

export const dynamic = 'force-dynamic'
// ~400 inserts across ~30 tables plus 25 portrait uploads.
export const maxDuration = 60

// Nightly reset of every demo community (lib/demo.ts): delete the guest Clerk
// users, then wipe and reseed the community from scripts/seed-demo/content.mjs.
// Only the community the seed content describes is touched (DEMO_SLUG);
// organizer rows (real Clerk users seeded with --organizer) carry over.
// Vercel Cron only — `Authorization: Bearer ${CRON_SECRET}`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const guestsDeleted = await deleteDemoGuestUsers()
  const communities = (await listCommunities()).filter(c => isDemoCommunity(c) && c.slug === DEMO_SLUG && c.status !== 'archived')
  const results = []
  for (const community of communities) {
    try {
      const { inserted, organizers } = await seedDemoCommunity(tenantDb(community.id), {
        communityId: community.id,
        reset: true,
        log: (msg: string) => console.log(`[demo-reset] ${community.slug}: ${msg}`),
      })
      revalidateTag(pageContentTag(community.id), 'max')
      results.push({ slug: community.slug, inserted, organizers: organizers.length })
    } catch (e) {
      console.error(`[demo-reset] ${community.slug} failed`, e)
      results.push({ slug: community.slug, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return NextResponse.json({ guestsDeleted, communities: results })
}

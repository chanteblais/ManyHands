import { unstable_cache } from 'next/cache'
import { tenantDb } from '@/lib/tenant-db'

// Cached, community-scoped reads of the `page_content` config table (form
// configs, homepage copy, feature toggles). The table is tiny, admin-edited,
// and read on nearly every server render and API call — so reads are cached
// in Next's data cache and invalidated by tag from the ONE writer, the upsert
// in app/api/admin/page-content/route.ts (which calls revalidateTag on save).
// Anything else that starts writing page_content must revalidate
// pageContentTag(communityId) too.
//
// Tags are per community (`page-content:<id>`) so one community's save never
// evicts another's config. unstable_cache fixes its tags at definition time,
// so the cached readers are created per community and memoized.

export function pageContentTag(communityId: string): string {
  return `page-content:${communityId}`
}

type Readers = {
  some: (keys: string[]) => Promise<Record<string, string>>
  all: () => Promise<Record<string, string>>
}

const readersByCommunity = new Map<string, Readers>()

function readersFor(communityId: string): Readers {
  let readers = readersByCommunity.get(communityId)
  if (readers) return readers
  const db = tenantDb(communityId)
  const tags = [pageContentTag(communityId)]

  const some = unstable_cache(
    async (keys: string[]): Promise<Record<string, string>> => {
      const { data, error } = await db.from('page_content').select('key, value').in('key', keys)
      if (error) {
        // Don't cache failures as empty config — surface them.
        throw new Error(`[page-content] read failed: ${error.message}`)
      }
      const map: Record<string, string> = {}
      for (const row of data ?? []) map[row.key] = row.value
      return map
    },
    ['page-content', communityId],
    { tags },
  )

  const all = unstable_cache(
    async (): Promise<Record<string, string>> => {
      const { data, error } = await db.from('page_content').select('key, value')
      if (error) throw new Error(`[page-content] read failed: ${error.message}`)
      const map: Record<string, string> = {}
      for (const row of data ?? []) map[row.key] = row.value
      return map
    },
    ['page-content-all', communityId],
    { tags },
  )

  readers = { some, all }
  readersByCommunity.set(communityId, readers)
  return readers
}

/** Cached `page_content` lookup: returns { key → value } for the keys that exist. */
export function getPageContent(communityId: string, keys: readonly string[]): Promise<Record<string, string>> {
  // Sorted so ['a','b'] and ['b','a'] share one cache entry.
  return readersFor(communityId).some([...keys].sort())
}

/** Cached single-key convenience: the value or null. */
export async function getPageContentValue(communityId: string, key: string): Promise<string | null> {
  const map = await getPageContent(communityId, [key])
  return map[key] ?? null
}

/** Whole-table read for pages that render many copy keys (homepage, about). */
export function getAllPageContent(communityId: string): Promise<Record<string, string>> {
  return readersFor(communityId).all()
}

import type { PostgrestFilterBuilder, SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase'

// The community-scoped database client (docs/tenancy-design.md §3).
//
//   const community = await getCommunity()
//   const db = tenantDb(community.id)
//   await db.from('members').select('id').eq('clerk_user_id', userId)   // + .eq('community_id', …)
//   await db.from('shoutouts').insert({ body, clerk_user_id })           // community_id stamped
//
// Every select/update/delete on a scoped table is filtered by community_id;
// every insert/upsert row is stamped with it (and refused if it carries a
// different one). Person-level tables (GLOBAL_TABLES) pass through unscoped.
// Raw `supabaseAdmin` is being retired from feature code — the scope guard
// (scripts/check-tenant-scope.mjs, part of `npm run check`) fails on any file
// that still imports it and isn't on the shrinking allowlist.

export const GLOBAL_TABLES: ReadonlySet<string> = new Set([
  'communities',
  'push_tokens',
  'notification_preferences',
])

export const COMMUNITY_COLUMN = 'community_id'

type QueryBuilder = ReturnType<SupabaseClient['from']>
type Row = Record<string, unknown>
type Count = 'exact' | 'planned' | 'estimated'
type SelectOptions = { head?: boolean; count?: Count }
type WriteOptions = { count?: Count; defaultToNull?: boolean }
type UpsertOptions = WriteOptions & { onConflict?: string; ignoreDuplicates?: boolean }

function stamp<T extends Row>(communityId: string, rows: T | T[]): (T & { community_id: string })[] {
  const list = Array.isArray(rows) ? rows : [rows]
  return list.map(row => {
    const existing = row[COMMUNITY_COLUMN]
    if (existing !== undefined && existing !== null && existing !== communityId) {
      throw new Error(
        `[tenant-db] refusing to write a row for community ${String(existing)} through a client scoped to ${communityId}`,
      )
    }
    return { ...row, [COMMUNITY_COLUMN]: communityId }
  })
}

// The project's client is untyped (Database = any), so rows are `any`
// everywhere. Casting through a concrete PostgrestFilterBuilder<any, …> keeps
// that contract without dragging supabase-js's query-string type parser into
// the wrapper (forwarding the column literal as a generic overflows tsc).
// Result = any[] so `.maybeSingle()` / `.single()` narrow to `any` (with a bare
// `any` they collapse to `{}`).
type Filter = PostgrestFilterBuilder<any, any, any, any[]>
const asFilter = (q: unknown) => q as Filter

// `scope === null` is the passthrough for GLOBAL_TABLES.
function scopedTable(base: QueryBuilder, scope: string | null) {
  return {
    select(columns?: string, options?: SelectOptions): Filter {
      const q = asFilter(base.select(columns as '*', options))
      return scope ? q.eq(COMMUNITY_COLUMN, scope) : q
    },
    insert(rows: Row | Row[], options?: WriteOptions): Filter {
      return asFilter(base.insert(scope ? stamp(scope, rows) : rows, options))
    },
    upsert(rows: Row | Row[], options?: UpsertOptions): Filter {
      return asFilter(base.upsert(scope ? stamp(scope, rows) : rows, options))
    },
    update(values: Row, options?: { count?: Count }): Filter {
      const q = asFilter(base.update(values, options))
      return scope ? q.eq(COMMUNITY_COLUMN, scope) : q
    },
    delete(options?: { count?: Count }): Filter {
      const q = asFilter(base.delete(options))
      return scope ? q.eq(COMMUNITY_COLUMN, scope) : q
    },
  }
}

/** A `from()` result whose reads and writes are pinned to one community. */
export type ScopedTable = ReturnType<typeof scopedTable>

export type TenantDb = {
  readonly communityId: string
  /** Scoped query builder for `table`; unscoped passthrough for GLOBAL_TABLES. */
  from: (table: string) => ScopedTable
  /** Postgres functions are not auto-scoped — pass the community explicitly where the function needs it. */
  rpc: SupabaseClient['rpc']
  /** Storage is not auto-scoped; use `objectPath()` for new uploads. */
  storage: SupabaseClient['storage']
}

export function tenantDb(communityId: string): TenantDb {
  if (!communityId) throw new Error('[tenant-db] communityId is required')
  return {
    communityId,
    from: (table: string) => scopedTable(supabaseAdmin.from(table), GLOBAL_TABLES.has(table) ? null : communityId),
    rpc: supabaseAdmin.rpc.bind(supabaseAdmin),
    storage: supabaseAdmin.storage,
  }
}

/**
 * Client for person-level tables only (`GLOBAL_TABLES`): push tokens,
 * notification preferences. Refuses scoped tables so a global helper can never
 * become an unscoped back door.
 */
export function globalDb(): { from: (table: string) => ScopedTable } {
  return {
    from(table: string) {
      if (!GLOBAL_TABLES.has(table)) {
        throw new Error(`[tenant-db] "${table}" is community-scoped — use tenantDb(community.id)`)
      }
      return scopedTable(supabaseAdmin.from(table), null)
    },
  }
}

/**
 * Object path for a new upload: `${communityId}/${relativePath}`. Existing
 * objects keep their pre-tenancy paths (tables store full URLs, so nothing
 * moves); readers of private buckets must check the prefix against the
 * caller's community.
 */
export function objectPath(communityId: string, relativePath: string): string {
  return `${communityId}/${relativePath.replace(/^\/+/, '')}`
}

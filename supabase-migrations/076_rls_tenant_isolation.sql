-- Migration 076: Multi-tenancy step 1e — row-level security as the second belt
-- (docs/tenancy-design.md decision #4, §8 row 1e).
--
-- Until now the app reached Postgres only with the service-role key, which
-- bypasses RLS; tenancy was enforced by lib/tenant-db.ts alone. From this
-- migration + the 1e code, feature queries run as the `authenticated` role with
-- a per-request JWT that carries `community_id`, and every scoped table has a
-- policy that only admits rows of that community. A query that forgets its
-- filter — or a bug in the wrapper — now returns nothing instead of leaking.
--
-- What it does (all idempotent):
--   1. Enables RLS on every table (a no-op where it is already on).
--   2. Scoped tables: policy `tenant_isolation` for `authenticated`, USING and
--      WITH CHECK `community_id = jwt claim community_id`.
--   3. Person-level tables (push_tokens, notification_preferences): policy
--      `app_access` for `authenticated` USING (true) — the app code is the gate
--      (a device/preference row is looked up by clerk_user_id for whichever
--      person a notification targets).
--   4. communities: SELECT for `authenticated` (host resolution reads it with
--      the service key anyway).
--   5. Grants: `authenticated` may use the schema, every table and sequence,
--      and execute claim_shift_signup() (security definer; it was
--      service_role-only). `anon` gets NO policies — the public key can still
--      read nothing.
--   Service role keeps bypassing RLS: lib/community.ts, scripts, storage, and
--   the fallback path when no signing secret is configured.
--
-- DEPLOY ORDER — apply this BEFORE setting SUPABASE_JWT_SECRET in Vercel.
-- Without the secret the app keeps using the service key (unchanged
-- behaviour). With the secret but without this migration, scoped queries run
-- as `authenticated` against RLS-enabled tables that have no policies and
-- return empty results — the app would look wiped. Then run
-- `node scripts/verify-tenant-isolation.mjs` locally (with the secret in
-- .env.local) before adding it to Vercel.
--
-- Not destructive (no rows, columns or constraints touched). Idempotent.

begin;

-- ---------------------------------------------------------------------------
-- Claim accessor: the community the current request's JWT names, or NULL.
-- ---------------------------------------------------------------------------
create or replace function public.request_community_id() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'community_id', '')::uuid
$$;
revoke execute on function public.request_community_id() from public;
grant execute on function public.request_community_id() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Grants (Supabase's default privileges usually cover this; make it explicit)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function claim_shift_signup(text, uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Scoped tables: RLS on + tenant_isolation policy
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  scoped_tables constant text[] := array[
    'applications', 'members', 'member_profiles', 'member_distinctions', 'volunteers',
    'departments', 'roles', 'group_collections', 'groups', 'group_members',
    'schedule_events', 'shift_types', 'member_shift_signups', 'camp_signups', 'event_rsvps',
    'admin_notifications', 'user_notifications', 'announcements', 'radio_events', 'page_content',
    'messages', 'conversations', 'conversation_participants', 'shoutouts', 'role_suggestions',
    'attunement_nudges', 'event_reminders_sent', 'lead_up_events', 'lead_up_event_rsvps',
    'resource_lists', 'resources', 'resource_claims', 'polls', 'poll_votes'
  ];
begin
  foreach t in array scoped_tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I for all to authenticated
         using (community_id = public.request_community_id())
         with check (community_id = public.request_community_id())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Person-level tables: RLS on, app-gated
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['push_tokens', 'notification_preferences'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists app_access on %I', t);
    execute format('create policy app_access on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- communities: readable, never writable, by the app role
-- ---------------------------------------------------------------------------
alter table communities enable row level security;
drop policy if exists app_read on communities;
create policy app_read on communities for select to authenticated using (true);

commit;

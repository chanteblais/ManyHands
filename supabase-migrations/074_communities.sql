-- Migration 074: Multi-tenancy foundation, step 1a (docs/tenancy-design.md).
--
-- Adds the `communities` tenant table, seeds Glåüm as community 1, and puts a
-- `community_id` column on every community-scoped table (34 tables — every
-- table except the person-level `push_tokens` and `notification_preferences`),
-- backfilled to Glåüm and NOT NULL.
--
-- TRANSITIONAL DEFAULT: while the code sweep (branches 1b–1d) is in progress,
-- inserts that don't yet supply community_id must keep working, so every new
-- column defaults to platform_default_community_id() (= the 'glaum' row).
-- Migration 075 (end of the sweep) drops that default, drops the function,
-- and swaps the per-person unique constraints for (community_id, …) ones.
-- Until 075, uniqueness is unchanged — the app still assumes one membership
-- per person, which is true while Glåüm is the only tenant.
--
-- Also: `members.role` / `members.can_manage_polls` (admin roles move from
-- Clerk publicMetadata into the DB — decision #1; backfilled by script in
-- branch 1d, unread until then), and claim_shift_signup() now stamps the
-- signup with its event's community_id (otherwise its insert would violate
-- the new NOT NULL).
--
-- DEPLOY ORDER: either order is safe. Old code keeps working after this
-- migration (defaults fill community_id); the 1a code keeps working before
-- it (lib/community.ts falls back to a synthetic default community and
-- warns). Apply it before starting branch 1b.
--
-- Not destructive (adds only; no rows or columns removed). Idempotent.

begin;

-- ---------------------------------------------------------------------------
-- 1. Tenant table
-- ---------------------------------------------------------------------------
create table if not exists communities (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,            -- 'glaum'; URL-safe, immutable
  name         text not null,                   -- 'Glåüm'
  description  text,
  hosts        text[] not null default '{}',    -- request hosts that resolve to this community
  timezone     text not null default 'UTC',     -- IANA name; crons + "today" (branch 1d)
  event_name   text,                            -- interim until Event is a first-class object
  email_from   text,                            -- 'Name <addr>'; NULL → platform default sender
  theme        jsonb not null default '{}'::jsonb,    -- colour/font tokens (branch 1f)
  settings     jsonb not null default '{}'::jsonb,    -- small platform-level knobs
  status       text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at   timestamptz not null default now()
);

-- Host lookup is `hosts @> array[host]`; GIN serves it. Host uniqueness across
-- rows is enforced by the (future) community-creation code, not the DB.
create index if not exists communities_hosts_gin on communities using gin (hosts);

insert into communities (slug, name, description, hosts, timezone, event_name, email_from)
values (
  'glaum',
  'Glåüm',
  'Glåüm Theme Camp at What If 2026.',
  array['camp.glaum.ca'],
  'America/Vancouver',
  'What If 2026',
  null  -- keep sending from the deployment's RESEND_FROM until branch 1b moves sender here
)
on conflict (slug) do nothing;

-- Transitional default (dropped in 075). Stable so it is evaluated once per
-- statement; it returns the Glåüm row's id.
create or replace function platform_default_community_id() returns uuid
language sql stable
as $$ select id from communities where slug = 'glaum' $$;

-- ---------------------------------------------------------------------------
-- 2. community_id on every scoped table
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
    if to_regclass('public.' || t) is null then
      raise exception 'migration 074: expected table % to exist', t;
    end if;
    execute format(
      'alter table %I add column if not exists community_id uuid references communities(id)', t);
    execute format(
      'update %I set community_id = platform_default_community_id() where community_id is null', t);
    execute format('alter table %I alter column community_id set not null', t);
    execute format(
      'alter table %I alter column community_id set default platform_default_community_id()', t);
    execute format(
      'create index if not exists %I on %I (community_id)', t || '_community_idx', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Community-scoped roles on members (decision #1). Unread until branch 1d.
-- ---------------------------------------------------------------------------
alter table members add column if not exists role text not null default 'member';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'members_role_check') then
    alter table members add constraint members_role_check check (role in ('member', 'admin'));
  end if;
end $$;
alter table members add column if not exists can_manage_polls boolean not null default false;

-- ---------------------------------------------------------------------------
-- 4. claim_shift_signup(): stamp the signup with the event's community.
--    Same signature and semantics as 073; only the select + insert change.
-- ---------------------------------------------------------------------------
create or replace function claim_shift_signup(
  p_clerk_user_id text,
  p_schedule_event_id uuid,
  p_occurrence_date date,
  p_role text default 'member'
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_community uuid;
  v_held int;
  v_rows int;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'claim_shift_signup:' || p_schedule_event_id::text || ':' || coalesce(p_occurrence_date::text, 'single'), 0));

  select capacity, community_id into v_capacity, v_community
  from schedule_events
  where id = p_schedule_event_id;
  if not found then
    return 'not_found';
  end if;

  if v_capacity is not null then
    select count(*) into v_held
    from member_shift_signups
    where schedule_event_id = p_schedule_event_id
      and occurrence_date is not distinct from p_occurrence_date;
    if v_held >= v_capacity then
      return 'full';
    end if;
  end if;

  insert into member_shift_signups (community_id, clerk_user_id, schedule_event_id, occurrence_date, role)
  values (v_community, p_clerk_user_id, p_schedule_event_id, p_occurrence_date, coalesce(p_role, 'member'))
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return case when v_rows = 0 then 'exists' else 'ok' end;
end;
$$;

revoke execute on function claim_shift_signup(text, uuid, date, text) from public;
revoke execute on function claim_shift_signup(text, uuid, date, text) from anon;
revoke execute on function claim_shift_signup(text, uuid, date, text) from authenticated;
grant execute on function claim_shift_signup(text, uuid, date, text) to service_role;

-- platform_default_community_id() is only ever called by column defaults
-- (definer context); keep it off the public API surface anyway.
revoke execute on function platform_default_community_id() from public;
revoke execute on function platform_default_community_id() from anon;
revoke execute on function platform_default_community_id() from authenticated;
grant execute on function platform_default_community_id() to service_role;

commit;

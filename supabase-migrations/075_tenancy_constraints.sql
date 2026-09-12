-- Migration 075: Multi-tenancy step 1d — end of the code sweep
-- (docs/tenancy-design.md §1.3 / §1.5).
--
-- 1. Drops the transitional column default `platform_default_community_id()`
--    that 074 put on every scoped table (every insert now supplies
--    community_id via lib/tenant-db.ts), and the function itself.
-- 2. Swaps the per-PERSON unique constraints for per-(community, person) ones,
--    so one person can hold a membership / role / DM thread / reminder ledger
--    in more than one community:
--      members            unique(clerk_user_id)             → (community_id, clerk_user_id)
--      camp_signups       unique(clerk_user_id)             → (community_id, clerk_user_id)
--      page_content       pk(key)                           → (community_id, key)
--      attunement_nudges  pk(clerk_user_id)                 → (community_id, clerk_user_id)
--      event_reminders_sent unique(clerk_user_id, target_date, phase)
--                                                           → (community_id, clerk_user_id, target_date, phase)
--      conversations      unique index direct_key           → (community_id, direct_key)
--      shift_types        unique(backfill_key)              → (community_id, backfill_key)
--      applications       (app-enforced one-per-user)       + unique (community_id, clerk_user_id) where clerk_user_id is not null
--    Constraints are located by their column set (not by name), so this works
--    whatever Postgres named them.
--
-- DEPLOY ORDER — apply this TOGETHER WITH the 1d code deploy (apply, then
-- merge/deploy right away): three upserts change their ON CONFLICT target to
-- the new composite keys (camp_signups role signup, page_content admin save,
-- attunement_nudges cron claim). Old code against this migration, or new code
-- without it, fails those three writes with "no unique constraint matching
-- ON CONFLICT" until the pair is aligned; everything else is unaffected.
--
-- Not destructive (no rows or columns removed; constraints replaced with
-- equivalents-or-wider). Idempotent.

begin;

-- ---------------------------------------------------------------------------
-- 1. Transitional default off; function gone
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
    execute format('alter table %I alter column community_id drop default', t);
  end loop;
end $$;

drop function if exists platform_default_community_id();

-- ---------------------------------------------------------------------------
-- 2. Constraint swaps. Helper: drop the unique/primary-key constraint on
--    exactly this column set, if one exists.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.drop_key_on(p_table text, p_cols text[]) returns void
language plpgsql as $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = p_table::regclass
      and con.contype in ('u', 'p')
      and (
        select array_agg(att.attname::text order by k.ord)
        from unnest(con.conkey) with ordinality as k(attnum, ord)
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
      ) = p_cols
  loop
    execute format('alter table %I drop constraint %I', p_table, c.conname);
  end loop;
end $$;

-- members: one membership per person per community
select pg_temp.drop_key_on('members', array['clerk_user_id']);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'members_community_user_uniq') then
    alter table members add constraint members_community_user_uniq unique (community_id, clerk_user_id);
  end if;
end $$;

-- camp_signups: one role assignment per person per community
select pg_temp.drop_key_on('camp_signups', array['clerk_user_id']);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'camp_signups_community_user_uniq') then
    alter table camp_signups add constraint camp_signups_community_user_uniq unique (community_id, clerk_user_id);
  end if;
end $$;

-- page_content: config keys are per community
select pg_temp.drop_key_on('page_content', array['key']);
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'page_content'::regclass and contype = 'p') then
    alter table page_content add primary key (community_id, key);
  end if;
end $$;

-- attunement_nudges: ledger per person per community
select pg_temp.drop_key_on('attunement_nudges', array['clerk_user_id']);
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'attunement_nudges'::regclass and contype = 'p') then
    alter table attunement_nudges add primary key (community_id, clerk_user_id);
  end if;
end $$;

-- event_reminders_sent: claim per person per community per date per phase
select pg_temp.drop_key_on('event_reminders_sent', array['clerk_user_id', 'target_date', 'phase']);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'event_reminders_sent_community_uniq') then
    alter table event_reminders_sent add constraint event_reminders_sent_community_uniq
      unique (community_id, clerk_user_id, target_date, phase);
  end if;
end $$;

-- conversations: one DM thread per pair per community (partial unique index, 033)
drop index if exists conversations_direct_uniq;
create unique index if not exists conversations_direct_uniq
  on conversations (community_id, direct_key) where direct_key is not null;

-- shift_types: backfill keys are per community
select pg_temp.drop_key_on('shift_types', array['backfill_key']);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'shift_types_community_backfill_uniq') then
    alter table shift_types add constraint shift_types_community_backfill_uniq unique (community_id, backfill_key);
  end if;
end $$;

-- applications: the app already enforces one live application per person;
-- make it a per-community fact the DB knows too (rows without a clerk id are
-- legacy imports and stay unconstrained).
create unique index if not exists applications_community_user_uniq
  on applications (community_id, clerk_user_id) where clerk_user_id is not null;

commit;

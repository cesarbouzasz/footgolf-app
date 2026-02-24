-- Delete dummy players created by the random-players endpoint.
-- Matches emails like: dummy01+202601@footgolftotal.test
-- SAFE MODE:
--   1) Leave do_delete = false for dry-run (default).
--   2) Set do_delete = true to execute deletes.

begin;

with params as (
  select false::boolean as do_delete
),
dummy_users as (
  select id, email
  from auth.users
  where email like 'dummy%@footgolftotal.test'
     or email like 'test+%@footgolf.app'
)
-- Remove memberships first (FKs from pair_members -> profiles).
, deleted_pair_members as (
  delete from public.pair_members
  where (select do_delete from params)
    and player_id in (select id from dummy_users)
  returning player_id
)
-- Remove profiles.
, deleted_profiles as (
  delete from public.profiles
  where (select do_delete from params)
    and id in (select id from dummy_users)
  returning id
)
-- Remove auth users.
, deleted_auth as (
  delete from auth.users
  where (select do_delete from params)
    and id in (select id from dummy_users)
  returning id
)
select
  (select do_delete from params) as do_delete,
  (select count(*) from dummy_users) as auth_users_matched,
  (select count(*) from public.pair_members pm where pm.player_id in (select id from dummy_users)) as pair_members_matched,
  (select count(*) from deleted_pair_members) as pair_members_deleted,
  (select count(*) from deleted_profiles) as profiles_deleted,
  (select count(*) from deleted_auth) as auth_users_deleted,
  (
    select coalesce(string_agg(email, ', '), '')
    from (
      select email
      from dummy_users
      order by email
      limit 20
    ) s
  ) as sample_emails;

commit;

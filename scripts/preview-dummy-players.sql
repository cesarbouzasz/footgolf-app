-- Preview dummy players without deleting anything.
-- Use this to verify if any dummy/test users are still present.

with dummy_users as (
  select id, email, created_at
  from auth.users
  where email like 'dummy%@footgolftotal.test'
     or email like 'test+%@footgolf.app'
),
counts as (
  select
    (select count(*) from dummy_users) as auth_users_matched,
    (
      select count(*)
      from public.pair_members pm
      where pm.player_id in (select id from dummy_users)
    ) as pair_members_matched,
    (
      select count(*)
      from public.profiles p
      where p.id in (select id from dummy_users)
    ) as profiles_matched
)
select * from counts;

-- Sample list (up to 100 users)
with dummy_users as (
  select id, email, created_at
  from auth.users
  where email like 'dummy%@footgolftotal.test'
     or email like 'test+%@footgolf.app'
)
select
  du.id,
  du.email,
  du.created_at,
  exists (select 1 from public.profiles p where p.id = du.id) as has_profile,
  (
    select count(*)
    from public.pair_members pm
    where pm.player_id = du.id
  ) as pair_members_count
from dummy_users du
order by du.email
limit 100;

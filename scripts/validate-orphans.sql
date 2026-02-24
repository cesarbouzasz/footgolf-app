-- Validate orphan records (read-only).
-- Goal: ensure data integrity after cleanup operations.

-- 1) Summary counts
select
  (
    select count(*)
    from public.profiles p
    left join auth.users u on u.id = p.id
    where u.id is null
  ) as profiles_without_auth_user,
  (
    select count(*)
    from public.pair_members pm
    left join public.profiles p on p.id = pm.player_id
    where p.id is null
  ) as pair_members_without_profile,
  (
    select count(*)
    from public.pair_members pm
    left join auth.users u on u.id = pm.player_id
    where u.id is null
  ) as pair_members_without_auth_user;

-- 2) Sample orphan profiles (up to 100)
select
  p.id,
  p.email,
  p.created_at
from public.profiles p
left join auth.users u on u.id = p.id
where u.id is null
order by p.created_at desc nulls last
limit 100;

-- 3) Sample orphan pair_members by missing profile (up to 100)
select
  pm.*
from public.pair_members pm
left join public.profiles p on p.id = pm.player_id
where p.id is null
limit 100;

-- 4) Sample orphan pair_members by missing auth user (up to 100)
select
  pm.*
from public.pair_members pm
left join auth.users u on u.id = pm.player_id
where u.id is null
limit 100;

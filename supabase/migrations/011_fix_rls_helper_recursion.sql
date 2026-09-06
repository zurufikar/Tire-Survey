-- 011_fix_rls_helper_recursion.sql
-- Fixes PostgreSQL "stack depth limit exceeded" caused by RLS helper
-- functions reading public.users while public.users itself is protected by RLS.
--
-- The helpers are intentionally SECURITY DEFINER so they can read the
-- authenticated user's profile without recursively invoking users RLS.

begin;

create or replace function public.current_user_profile()
returns public.users
language sql
stable
security definer
set search_path = public
as $$
  select u
  from public.users u
  where u.id = auth.uid()
  limit 1;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select u.role
  from public.users u
  where u.id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select u.is_active
      from public.users u
      where u.id = auth.uid()
    ),
    false
  );
$$;

commit;

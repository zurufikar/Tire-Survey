begin;

create or replace function public.get_report_user_profiles()
returns table (
  id uuid,
  user_code text,
  full_name text,
  role public.app_role
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.user_code, u.full_name, u.role
  from public.users u
  where u.is_active = true
    and public.current_app_role() in ('pm_pic', 'superadmin')
  order by u.role, u.user_code, u.full_name;
$$;

grant execute on function public.get_report_user_profiles() to authenticated;

commit;

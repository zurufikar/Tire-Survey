
-- 003_auth_profile_and_rls.sql
-- Tire Survey WebApp
-- Purpose: connect Supabase Auth to public.users and enforce basic RLS.

begin;

-- 1) Create a profile row automatically when a Supabase Auth user is created.
-- Default role is supplier. Superadmin can change the role later.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    user_code,
    full_name,
    role,
    is_active
  )
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'user_code', ''),
      'USR-' || upper(substr(replace(new.id::text, '-', ''), 1, 8))
    ),
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      coalesce(new.email, 'New User')
    ),
    'supplier'::public.app_role,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();


-- 2) Helper functions for RLS.
create or replace function public.current_user_profile()
returns public.users
language sql
stable
security invoker
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
security invoker
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
security invoker
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


-- 3) Enable RLS.
alter table public.users enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_axle_configs enable row level security;
alter table public.survey_tires enable row level security;
alter table public.vehicle_photos enable row level security;
alter table public.tire_photos enable row level security;
alter table public.photo_reviews enable row level security;
alter table public.qc_reviews enable row level security;
alter table public.backend_reviews enable row level security;
alter table public.qc_assignments enable row level security;
alter table public.activity_logs enable row level security;


-- 4) Users:
-- A user can read only their own profile.
-- Superadmin can read/update all profiles.
create policy "users_select_own_or_superadmin"
on public.users
for select
to authenticated
using (
  id = auth.uid()
  or (
    public.current_user_is_active()
    and public.current_app_role() = 'superadmin'
  )
);

create policy "users_update_superadmin"
on public.users
for update
to authenticated
using (
  public.current_user_is_active()
  and public.current_app_role() = 'superadmin'
)
with check (
  public.current_user_is_active()
  and public.current_app_role() = 'superadmin'
);


-- 5) Surveys:
-- Supplier sees/creates/updates own surveys.
-- QC+Backend, PM/PIC, Superadmin may read all active data.
-- Only Superadmin may update arbitrary survey rows.
create policy "surveys_supplier_select"
on public.surveys
for select
to authenticated
using (
  supplier_id = auth.uid()
  or (
    public.current_user_is_active()
    and public.current_app_role() in ('qc_backend','pm_pic','superadmin')
  )
);

create policy "surveys_supplier_insert"
on public.surveys
for insert
to authenticated
with check (
  supplier_id = auth.uid()
  and public.current_user_is_active()
  and public.current_app_role() = 'supplier'
);

create policy "surveys_supplier_update"
on public.surveys
for update
to authenticated
using (
  supplier_id = auth.uid()
  and public.current_user_is_active()
  and public.current_app_role() = 'supplier'
)
with check (
  supplier_id = auth.uid()
  and public.current_user_is_active()
  and public.current_app_role() = 'supplier'
);

create policy "surveys_superadmin_update"
on public.surveys
for update
to authenticated
using (
  public.current_user_is_active()
  and public.current_app_role() = 'superadmin'
)
with check (
  public.current_user_is_active()
  and public.current_app_role() = 'superadmin'
);


-- 6) Child survey tables:
-- Read follows survey access. Writes are restricted to the owning supplier
-- for supplier-owned drafts, while workflow updates will later use server-side RPCs.
create policy "survey_axles_select"
on public.survey_axle_configs
for select
to authenticated
using (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_axle_configs.survey_id
      and (
        s.supplier_id = auth.uid()
        or (
          public.current_user_is_active()
          and public.current_app_role() in ('qc_backend','pm_pic','superadmin')
        )
      )
  )
);

create policy "survey_axles_supplier_insert"
on public.survey_axle_configs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_axle_configs.survey_id
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
      and public.current_user_is_active()
      and public.current_app_role() = 'supplier'
  )
);

create policy "survey_axles_supplier_update"
on public.survey_axle_configs
for update
to authenticated
using (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_axle_configs.survey_id
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
      and public.current_user_is_active()
      and public.current_app_role() = 'supplier'
  )
)
with check (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_axle_configs.survey_id
      and s.supplier_id = auth.uid()
      and public.current_app_role() = 'supplier'
  )
);

create policy "survey_tires_select"
on public.survey_tires
for select
to authenticated
using (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_tires.survey_id
      and (
        s.supplier_id = auth.uid()
        or (
          public.current_user_is_active()
          and public.current_app_role() in ('qc_backend','pm_pic','superadmin')
        )
      )
  )
);

create policy "survey_tires_supplier_insert"
on public.survey_tires
for insert
to authenticated
with check (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_tires.survey_id
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
      and public.current_user_is_active()
      and public.current_app_role() = 'supplier'
  )
);

create policy "survey_tires_supplier_update"
on public.survey_tires
for update
to authenticated
using (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_tires.survey_id
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
      and public.current_user_is_active()
      and public.current_app_role() = 'supplier'
  )
)
with check (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_tires.survey_id
      and s.supplier_id = auth.uid()
      and public.current_app_role() = 'supplier'
  )
);


-- 7) Photos:
create policy "vehicle_photos_select"
on public.vehicle_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.surveys s
    where s.id = vehicle_photos.survey_id
      and (
        s.supplier_id = auth.uid()
        or (
          public.current_user_is_active()
          and public.current_app_role() in ('qc_backend','pm_pic','superadmin')
        )
      )
  )
);

create policy "vehicle_photos_supplier_insert"
on public.vehicle_photos
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.surveys s
    where s.id = vehicle_photos.survey_id
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
  )
);

create policy "tire_photos_select"
on public.tire_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.surveys s
    join public.survey_tires t on t.survey_id = s.id
    where t.id = tire_photos.survey_tire_id
      and (
        s.supplier_id = auth.uid()
        or (
          public.current_user_is_active()
          and public.current_app_role() in ('qc_backend','pm_pic','superadmin')
        )
      )
  )
);

create policy "tire_photos_supplier_insert"
on public.tire_photos
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.survey_tires t
    join public.surveys s on s.id = t.survey_id
    where t.id = tire_photos.survey_tire_id
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
  )
);

create policy "tire_photos_supplier_delete"
on public.tire_photos
for delete
to authenticated
using (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.survey_tires t
    join public.surveys s on s.id = t.survey_id
    where t.id = tire_photos.survey_tire_id
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
  )
);


-- 8) QC / Backend / assignments / logs:
create policy "photo_reviews_qc_read"
on public.photo_reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.tire_photos p
    join public.survey_tires t on t.id = p.survey_tire_id
    join public.surveys s on s.id = t.survey_id
    where p.id = photo_reviews.photo_id
      and (
        s.supplier_id = auth.uid()
        or (
          public.current_user_is_active()
          and public.current_app_role() in ('qc_backend','pm_pic','superadmin')
        )
      )
  )
);

create policy "photo_reviews_qc_write"
on public.photo_reviews
for all
to authenticated
using (
  public.current_user_is_active()
  and public.current_app_role() in ('qc_backend','superadmin')
)
with check (
  public.current_user_is_active()
  and public.current_app_role() in ('qc_backend','superadmin')
);

create policy "qc_reviews_read"
on public.qc_reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.surveys s
    where s.id = qc_reviews.survey_id
      and (
        s.supplier_id = auth.uid()
        or (
          public.current_user_is_active()
          and public.current_app_role() in ('qc_backend','pm_pic','superadmin')
        )
      )
  )
);

create policy "qc_reviews_write"
on public.qc_reviews
for all
to authenticated
using (
  public.current_user_is_active()
  and public.current_app_role() in ('qc_backend','superadmin')
)
with check (
  public.current_user_is_active()
  and public.current_app_role() in ('qc_backend','superadmin')
);

create policy "backend_reviews_read"
on public.backend_reviews
for select
to authenticated
using (
  exists (
    select 1
    from public.surveys s
    where s.id = backend_reviews.survey_id
      and (
        s.supplier_id = auth.uid()
        or (
          public.current_user_is_active()
          and public.current_app_role() in ('qc_backend','pm_pic','superadmin')
        )
      )
  )
);

create policy "backend_reviews_write"
on public.backend_reviews
for all
to authenticated
using (
  public.current_user_is_active()
  and public.current_app_role() in ('qc_backend','superadmin')
)
with check (
  public.current_user_is_active()
  and public.current_app_role() in ('qc_backend','superadmin')
);

create policy "qc_assignments_read"
on public.qc_assignments
for select
to authenticated
using (
  public.current_user_is_active()
  and public.current_app_role() in ('qc_backend','pm_pic','superadmin')
);

create policy "qc_assignments_write"
on public.qc_assignments
for all
to authenticated
using (
  public.current_user_is_active()
  and public.current_app_role() = 'superadmin'
)
with check (
  public.current_user_is_active()
  and public.current_app_role() = 'superadmin'
);

create policy "activity_logs_read"
on public.activity_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.surveys s
    where s.id = activity_logs.survey_id
      and (
        s.supplier_id = auth.uid()
        or (
          public.current_user_is_active()
          and public.current_app_role() in ('qc_backend','pm_pic','superadmin')
        )
      )
  )
);


-- 9) Master data is readable by authenticated active users.
-- Write access remains disabled through RLS because only Superadmin
-- will later manage master data via secured admin operations.
alter table public.master_provinces enable row level security;
alter table public.master_cities enable row level security;
alter table public.master_vehicle_brands enable row level security;
alter table public.master_tire_brands enable row level security;
alter table public.master_tire_sizes enable row level security;
alter table public.master_tire_patterns enable row level security;
alter table public.tire_photo_categories enable row level security;

create policy "master_provinces_read_active"
on public.master_provinces for select to authenticated
using (is_active and public.current_user_is_active());

create policy "master_cities_read_active"
on public.master_cities for select to authenticated
using (is_active and public.current_user_is_active());

create policy "master_vehicle_brands_read_active"
on public.master_vehicle_brands for select to authenticated
using (is_active and public.current_user_is_active());

create policy "master_tire_brands_read_active"
on public.master_tire_brands for select to authenticated
using (is_active and public.current_user_is_active());

create policy "master_tire_sizes_read_active"
on public.master_tire_sizes for select to authenticated
using (is_active and public.current_user_is_active());

create policy "master_tire_patterns_read_active"
on public.master_tire_patterns for select to authenticated
using (is_active and public.current_user_is_active());

create policy "tire_photo_categories_read_active"
on public.tire_photo_categories for select to authenticated
using (true and public.current_user_is_active());

commit;

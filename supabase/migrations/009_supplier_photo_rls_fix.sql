-- Migration 009: Supplier photo RLS/storage policies
-- Fixes upload/delete no-op caused by missing RLS policies.

insert into storage.buckets (id, name, public)
values ('survey-photos', 'survey-photos', false)
on conflict (id) do update set public = false;

-- Storage: Supplier may read/write only files under their own DRAFT survey folder.
drop policy if exists "supplier_select_survey_photos" on storage.objects;
drop policy if exists "supplier_insert_survey_photos" on storage.objects;
drop policy if exists "supplier_delete_survey_photos" on storage.objects;

create policy "supplier_select_survey_photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'survey-photos'
  and exists (
    select 1
    from public.surveys s
    where s.id::text = (storage.foldername(name))[1]
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
  )
);

create policy "supplier_insert_survey_photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'survey-photos'
  and exists (
    select 1
    from public.surveys s
    where s.id::text = (storage.foldername(name))[1]
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
  )
);

create policy "supplier_delete_survey_photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'survey-photos'
  and exists (
    select 1
    from public.surveys s
    where s.id::text = (storage.foldername(name))[1]
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
  )
);

-- Metadata tables: Supplier can read/insert/delete photos belonging to own DRAFT survey.
drop policy if exists "supplier_select_vehicle_photos" on public.vehicle_photos;
drop policy if exists "supplier_insert_vehicle_photos" on public.vehicle_photos;
drop policy if exists "supplier_delete_vehicle_photos" on public.vehicle_photos;

drop policy if exists "supplier_select_tire_photos" on public.tire_photos;
drop policy if exists "supplier_insert_tire_photos" on public.tire_photos;
drop policy if exists "supplier_delete_tire_photos" on public.tire_photos;

create policy "supplier_select_vehicle_photos"
on public.vehicle_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.surveys s
    where s.id = vehicle_photos.survey_id
      and s.supplier_id = auth.uid()
  )
);

create policy "supplier_insert_vehicle_photos"
on public.vehicle_photos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.surveys s
    where s.id = vehicle_photos.survey_id
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
  )
  and uploaded_by = auth.uid()
);

create policy "supplier_delete_vehicle_photos"
on public.vehicle_photos
for delete
to authenticated
using (
  exists (
    select 1
    from public.surveys s
    where s.id = vehicle_photos.survey_id
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
  )
);

create policy "supplier_select_tire_photos"
on public.tire_photos
for select
to authenticated
using (
  exists (
    select 1
    from public.survey_tires st
    join public.surveys s on s.id = st.survey_id
    where st.id = tire_photos.survey_tire_id
      and s.supplier_id = auth.uid()
  )
);

create policy "supplier_insert_tire_photos"
on public.tire_photos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.survey_tires st
    join public.surveys s on s.id = st.survey_id
    where st.id = tire_photos.survey_tire_id
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
  )
  and uploaded_by = auth.uid()
);

create policy "supplier_delete_tire_photos"
on public.tire_photos
for delete
to authenticated
using (
  exists (
    select 1
    from public.survey_tires st
    join public.surveys s on s.id = st.survey_id
    where st.id = tire_photos.survey_tire_id
      and s.supplier_id = auth.uid()
      and s.status = 'DRAFT'
  )
);

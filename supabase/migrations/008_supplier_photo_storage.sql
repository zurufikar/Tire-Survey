-- Migration 008: Supplier photo storage for Section 4
-- Private bucket; photo bytes live in Supabase Storage, metadata remains in public.* tables.

insert into storage.buckets (id, name, public)
values ('survey-photos', 'survey-photos', false)
on conflict (id) do update
set public = false;

-- Storage path convention:
-- {survey_id}/{vehicle|tire}/{target}/{uuid}.{ext}

 drop policy if exists "survey_photos_supplier_select" on storage.objects;
 create policy "survey_photos_supplier_select"
 on storage.objects
 for select
 to authenticated
 using (
   bucket_id = 'survey-photos'
   and split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
   and exists (
     select 1
     from public.surveys s
     where s.id = split_part(storage.objects.name, '/', 1)::uuid
       and s.supplier_id = auth.uid()
   )
 );

 drop policy if exists "survey_photos_operational_select" on storage.objects;
 create policy "survey_photos_operational_select"
 on storage.objects
 for select
 to authenticated
 using (
   bucket_id = 'survey-photos'
   and public.current_user_is_active()
   and public.current_app_role() in ('qc_backend', 'pm_pic', 'superadmin')
   and split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
   and exists (
     select 1
     from public.surveys s
     where s.id = split_part(storage.objects.name, '/', 1)::uuid
   )
 );

 drop policy if exists "survey_photos_supplier_insert" on storage.objects;
 create policy "survey_photos_supplier_insert"
 on storage.objects
 for insert
 to authenticated
 with check (
   bucket_id = 'survey-photos'
   and public.current_user_is_active()
   and public.current_app_role() = 'supplier'
   and split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
   and exists (
     select 1
     from public.surveys s
     where s.id = split_part(storage.objects.name, '/', 1)::uuid
       and s.supplier_id = auth.uid()
       and s.status = 'DRAFT'
   )
 );

 drop policy if exists "survey_photos_supplier_delete" on storage.objects;
 create policy "survey_photos_supplier_delete"
 on storage.objects
 for delete
 to authenticated
 using (
   bucket_id = 'survey-photos'
   and public.current_user_is_active()
   and public.current_app_role() = 'supplier'
   and split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
   and exists (
     select 1
     from public.surveys s
     where s.id = split_part(storage.objects.name, '/', 1)::uuid
       and s.supplier_id = auth.uid()
       and s.status = 'DRAFT'
   )
 );

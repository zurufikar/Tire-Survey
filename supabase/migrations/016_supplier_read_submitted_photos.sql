-- Migration 016: Supplier can read private survey photos after Submit.
-- Access remains private and is limited to the owner of the survey.

begin;

drop policy if exists "supplier_select_survey_photos" on storage.objects;

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
  )
);

commit;

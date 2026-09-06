-- Migration 015: allow assigned QC users to read private survey photos.
-- The bucket remains private. Access is limited to active qc_backend users
-- who are assigned to the survey represented by the first path segment.

begin;

create policy "qc_backend_select_assigned_survey_photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'survey-photos'
  and public.current_user_is_active()
  and public.current_app_role() = 'qc_backend'
  and exists (
    select 1
    from public.qc_assignments qa
    where qa.survey_id::text = (storage.foldername(name))[1]
      and qa.assigned_to = auth.uid()
  )
);

-- QC needs to display the Supplier identity in the review workspace.
-- Keep access narrow: only the Supplier attached to a survey assigned to this QC.
create policy "qc_backend_read_assigned_supplier_profile"
on public.users
for select
to authenticated
using (
  id <> auth.uid()
  and public.current_user_is_active()
  and public.current_app_role() = 'qc_backend'
  and exists (
    select 1
    from public.qc_assignments qa
    join public.surveys s on s.id = qa.survey_id
    where qa.assigned_to = auth.uid()
      and s.supplier_id = users.id
  )
);

commit;

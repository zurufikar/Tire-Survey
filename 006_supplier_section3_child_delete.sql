-- Migration 006: allow Supplier to remove generated tire positions while editing a Draft.
-- This is required when axle configuration changes and old positions no longer apply.
-- Photos are a later milestone; deleting a survey_tires row will cascade to its child tire_photos.

create policy "survey_tires_supplier_delete"
on public.survey_tires
for delete
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
);

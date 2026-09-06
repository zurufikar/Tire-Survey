begin;

create or replace function public.current_backend_can_access_survey(p_survey_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_active()
    and public.current_app_role() = 'qc_backend'
    and exists (
      select 1
      from public.qc_assignments a
      join public.surveys s on s.id = a.survey_id
      where a.survey_id = p_survey_id
        and a.assigned_to = auth.uid()
        and s.status in ('QC_PASSED','BACKEND_REVIEW','COMPLETED')
    );
$$;

-- Backend may correct vehicle answers for surveys assigned to the logged-in QC+Backend user.
drop policy if exists "surveys_backend_update_assigned" on public.surveys;
create policy "surveys_backend_update_assigned"
on public.surveys
for update
to authenticated
using (public.current_backend_can_access_survey(id))
with check (
  public.current_backend_can_access_survey(id)
  or (
    public.current_user_is_active()
    and public.current_app_role() = 'qc_backend'
    and status in ('QC_PASSED','BACKEND_REVIEW','COMPLETED')
    and supplier_id = surveys.supplier_id
  )
);

-- Backend may fill technical tire fields only on its assigned survey.
drop policy if exists "survey_tires_backend_update_assigned" on public.survey_tires;
create policy "survey_tires_backend_update_assigned"
on public.survey_tires
for update
to authenticated
using (public.current_backend_can_access_survey(survey_tires.survey_id))
with check (public.current_backend_can_access_survey(survey_tires.survey_id));

-- Backend review records are owned by the assigned operator for the survey.
drop policy if exists "backend_reviews_backend_assigned" on public.backend_reviews;
create policy "backend_reviews_backend_assigned"
on public.backend_reviews
for all
to authenticated
using (public.current_backend_can_access_survey(survey_id))
with check (public.current_backend_can_access_survey(survey_id) and reviewer_id = auth.uid());

commit;

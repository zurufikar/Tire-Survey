-- 004_allow_draft_survey_fields.sql
-- Draft surveys may be created before vehicle information is filled.
-- Required fields are enforced later at Submit time.

begin;

alter table public.surveys
  alter column plate_number drop not null;

comment on column public.surveys.plate_number is
  'Nullable while status = DRAFT; required before Submit.';

commit;

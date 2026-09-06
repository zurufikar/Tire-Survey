-- Tire Survey WebApp
-- Migration 013: QC round-robin assignment
-- M6.1: create a stable QC assignment whenever a Supplier submission exists.
--
-- Design notes:
-- 1. Assignment order is global and never reshuffled.
-- 2. Only active qc_backend users participate.
-- 3. New QC users are appended by users.created_at/id ordering.
-- 4. The next assignment continues after the previously assigned active QC user.
--    This preserves the agreed behavior when QC staff are added later.
-- 5. The transaction advisory lock serializes assignment decisions so two
--    simultaneous submissions cannot choose the same queue slot incorrectly.

begin;

create or replace function public.assign_survey_to_qc(p_survey_id uuid)
returns public.qc_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.qc_assignments;
  assignment_no bigint;
  qc_count integer;
  previous_assignee uuid;
  selected_qc uuid;
begin
  -- Serialize all assignment decisions in this transaction.
  perform pg_advisory_xact_lock(hashtextextended('tire-survey-qc-round-robin', 0));

  -- Idempotent: never create a second assignment for the same survey.
  select *
  into result
  from public.qc_assignments
  where survey_id = p_survey_id
  limit 1;

  if found then
    return result;
  end if;

  -- Only a submitted survey may enter the QC queue.
  if not exists (
    select 1
    from public.surveys s
    where s.id = p_survey_id
      and s.status = 'SUBMITTED'
      and s.serial_number is not null
  ) then
    return null;
  end if;

  select count(*)::integer
  into qc_count
  from public.users u
  where u.role = 'qc_backend'
    and u.is_active = true;

  if qc_count = 0 then
    -- No active QC operator yet. The submitted survey remains unassigned
    -- and can be picked up by the backfill when a QC operator is activated.
    return null;
  end if;

  select coalesce(max(qa.assignment_order), 0) + 1
  into assignment_no
  from public.qc_assignments qa;

  -- Continue after the last assigned QC that is still active. If that QC was
  -- deactivated, choose the first active QC following the old position.
  select qa.assigned_to
  into previous_assignee
  from public.qc_assignments qa
  order by qa.assignment_order desc
  limit 1;

  if previous_assignee is null then
    select u.id
    into selected_qc
    from public.users u
    where u.role = 'qc_backend'
      and u.is_active = true
    order by u.created_at, u.id
    limit 1;
  else
    select candidate.id
    into selected_qc
    from public.users candidate
    where candidate.role = 'qc_backend'
      and candidate.is_active = true
      and (
        candidate.created_at > coalesce(
          (select prior.created_at from public.users prior where prior.id = previous_assignee),
          '-infinity'::timestamptz
        )
        or (
          candidate.created_at = coalesce(
            (select prior.created_at from public.users prior where prior.id = previous_assignee),
            '-infinity'::timestamptz
          )
          and candidate.id > previous_assignee
        )
      )
    order by candidate.created_at, candidate.id
    limit 1;

    if selected_qc is null then
      select u.id
      into selected_qc
      from public.users u
      where u.role = 'qc_backend'
        and u.is_active = true
      order by u.created_at, u.id
      limit 1;
    end if;
  end if;

  if selected_qc is null then
    return null;
  end if;

  insert into public.qc_assignments (
    survey_id,
    assigned_to,
    assignment_order
  )
  values (
    p_survey_id,
    selected_qc,
    assignment_no
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.trg_assign_submitted_survey_to_qc()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'SUBMITTED'
     and new.serial_number is not null
     and (
       tg_op = 'INSERT'
       or old.status is distinct from 'SUBMITTED'
       or old.serial_number is distinct from new.serial_number
     ) then
    perform public.assign_survey_to_qc(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_submitted_survey_to_qc on public.surveys;

create trigger trg_assign_submitted_survey_to_qc
after insert or update of status, serial_number on public.surveys
for each row
execute function public.trg_assign_submitted_survey_to_qc();

-- Backfill submissions created before this migration.
-- This is safe because assign_survey_to_qc() is idempotent.
do $$
declare
  survey_row record;
begin
  for survey_row in
    select s.id
    from public.surveys s
    left join public.qc_assignments qa on qa.survey_id = s.id
    where s.status = 'SUBMITTED'
      and s.serial_number is not null
      and qa.id is null
    order by s.created_at, s.id
  loop
    perform public.assign_survey_to_qc(survey_row.id);
  end loop;
end;
$$;

commit;

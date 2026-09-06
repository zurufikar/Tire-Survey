-- Tire Survey WebApp
-- Migration 014: QC review workspace persistence and decision RPC.
-- Adds review comments to vehicle-photo sections and tire positions, then
-- persists a single QC decision transactionally.

begin;

alter table public.vehicle_photos
  add column if not exists qc_comment text;

alter table public.survey_tires
  add column if not exists qc_comment text;

create or replace function public.submit_qc_review(
  p_survey_id uuid,
  p_decision text,
  p_overall_comment text,
  p_vehicle_comments jsonb default '[]'::jsonb,
  p_tire_comments jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  current_status public.survey_status;
  old_status public.survey_status;
  normalized_decision text := upper(trim(coalesce(p_decision, '')));
  assigned boolean;
begin
  if actor_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = actor_id
      and u.is_active = true
      and u.role in ('qc_backend', 'superadmin')
  ) then
    raise exception 'FORBIDDEN';
  end if;

  if normalized_decision not in ('PASS', 'REVISION', 'DROP') then
    raise exception 'INVALID_DECISION';
  end if;

  select s.status
  into current_status
  from public.surveys s
  where s.id = p_survey_id
  for update;

  if not found then
    raise exception 'SURVEY_NOT_FOUND';
  end if;

  if current_status not in ('SUBMITTED', 'QC_REVIEW') then
    raise exception 'SURVEY_NOT_IN_QC_STATE';
  end if;

  if (select role from public.users where id = actor_id) = 'qc_backend' then
    select exists (
      select 1
      from public.qc_assignments qa
      where qa.survey_id = p_survey_id
        and qa.assigned_to = actor_id
    ) into assigned;

    if not assigned then
      raise exception 'NOT_ASSIGNED_TO_QC';
    end if;
  end if;

  -- Apply the position-level comments. Unknown IDs are ignored by design;
  -- the caller still receives a successful transaction for valid rows.
  update public.vehicle_photos vp
  set qc_comment = nullif(trim(coalesce(item.comment, '')), '')
  from jsonb_to_recordset(coalesce(p_vehicle_comments, '[]'::jsonb)) as item(photo_id uuid, comment text)
  where vp.id = item.photo_id
    and vp.survey_id = p_survey_id;

  update public.survey_tires st
  set qc_comment = nullif(trim(coalesce(item.comment, '')), '')
  from jsonb_to_recordset(coalesce(p_tire_comments, '[]'::jsonb)) as item(tire_id uuid, comment text)
  where st.id = item.tire_id
    and st.survey_id = p_survey_id;

  old_status := current_status;

  insert into public.qc_reviews (
    survey_id,
    reviewer_id,
    decision,
    overall_comment,
    reviewed_at
  )
  values (
    p_survey_id,
    actor_id,
    case
      when normalized_decision = 'PASS' then 'PASS'::public.qc_decision
      when normalized_decision = 'DROP' then 'DROP'::public.qc_decision
      else 'PENDING'::public.qc_decision
    end,
    nullif(trim(coalesce(p_overall_comment, '')), ''),
    now()
  );

  update public.surveys
  set status = case normalized_decision
    when 'PASS' then 'QC_PASSED'::public.survey_status
    when 'REVISION' then 'QC_REVISION'::public.survey_status
    when 'DROP' then 'QC_DROPPED'::public.survey_status
  end,
  updated_at = now()
  where id = p_survey_id;

  insert into public.activity_logs (
    survey_id,
    actor_id,
    action,
    old_value,
    new_value
  )
  values (
    p_survey_id,
    actor_id,
    case normalized_decision
      when 'PASS' then 'QC_PASS'
      when 'REVISION' then 'QC_REVISION'
      when 'DROP' then 'QC_DROP'
    end,
    jsonb_build_object('status', old_status),
    jsonb_build_object(
      'status', case normalized_decision
        when 'PASS' then 'QC_PASSED'
        when 'REVISION' then 'QC_REVISION'
        when 'DROP' then 'QC_DROPPED'
      end
    )
  );
end;
$$;

grant execute on function public.submit_qc_review(uuid, text, text, jsonb, jsonb) to authenticated;

commit;

-- 005_supplier_section2_fixes.sql
-- Supplier Section 1 + 2
-- Adds "Lainnya" support for City and Vehicle Brand,
-- and a secure cross-supplier active plate availability check.

begin;

alter table public.surveys
  add column if not exists city_other text,
  add column if not exists vehicle_brand_other text;

comment on column public.surveys.city_other is
  'Manual city name when supplier selects Kota = Lainnya.';

comment on column public.surveys.vehicle_brand_other is
  'Manual vehicle brand when supplier selects Merk Kendaraan = Lainnya.';


create or replace function public.is_plate_available(
  p_plate text,
  p_survey_id uuid default null
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.surveys s
    where s.plate_number =
      upper(regexp_replace(trim(p_plate), '\s+', '', 'g'))
      and (p_survey_id is null or s.id <> p_survey_id)
      and s.status <> 'QC_DROPPED'
  );
$$;

revoke all on function public.is_plate_available(text, uuid)
from public, anon;

grant execute on function public.is_plate_available(text, uuid)
to authenticated;

commit;

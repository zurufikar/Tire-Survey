begin;

-- A new DRAFT is created before the Supplier enters a plate number.
-- plate_number is currently stored as an empty string during that state.
-- The active-plate uniqueness rule should apply only to real plate numbers.
-- This preserves BR-005: an active/non-dropped real plate blocks duplicates,
-- while multiple not-yet-started drafts are allowed.

drop index if exists public.uq_active_plate;

create unique index uq_active_plate
on public.surveys(plate_number)
where status <> 'QC_DROPPED'
  and plate_number <> '';

commit;

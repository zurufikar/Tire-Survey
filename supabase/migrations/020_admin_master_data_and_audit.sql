-- 020_admin_master_data_and_audit.sql
-- Tire Survey WebApp
-- Purpose: unblock the Superadmin screens (FR-ADM-002/003/005/006/007 in the SRS).
--
-- 003_auth_profile_and_rls.sql intentionally left master data write-locked
-- ("Write access remains disabled through RLS because only Superadmin will
-- later manage master data via secured admin operations.") and activity_logs
-- readable only through a survey join. This migration adds that superadmin
-- path without touching any existing policy.

begin;

-- 1) Superadmin can insert/update/delete every master data table.
--    (Existing "*_read_active" policies are untouched and keep serving
--    ordinary active users; Postgres OR's permissive policies together.)
create policy "master_provinces_admin_write"
on public.master_provinces for all to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin')
with check (public.current_user_is_active() and public.current_app_role() = 'superadmin');

create policy "master_cities_admin_write"
on public.master_cities for all to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin')
with check (public.current_user_is_active() and public.current_app_role() = 'superadmin');

create policy "master_vehicle_brands_admin_write"
on public.master_vehicle_brands for all to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin')
with check (public.current_user_is_active() and public.current_app_role() = 'superadmin');

create policy "master_tire_brands_admin_write"
on public.master_tire_brands for all to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin')
with check (public.current_user_is_active() and public.current_app_role() = 'superadmin');

create policy "master_tire_sizes_admin_write"
on public.master_tire_sizes for all to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin')
with check (public.current_user_is_active() and public.current_app_role() = 'superadmin');

create policy "master_tire_patterns_admin_write"
on public.master_tire_patterns for all to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin')
with check (public.current_user_is_active() and public.current_app_role() = 'superadmin');

create policy "tire_photo_categories_admin_write"
on public.tire_photo_categories for all to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin')
with check (public.current_user_is_active() and public.current_app_role() = 'superadmin');

-- 2) Superadmin can see every master data row (including inactive ones the
--    "*_read_active" policies hide) so the admin screen can list and
--    re-activate a disabled entry.
create policy "master_provinces_admin_read_all"
on public.master_provinces for select to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin');

create policy "master_cities_admin_read_all"
on public.master_cities for select to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin');

create policy "master_vehicle_brands_admin_read_all"
on public.master_vehicle_brands for select to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin');

create policy "master_tire_brands_admin_read_all"
on public.master_tire_brands for select to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin');

create policy "master_tire_sizes_admin_read_all"
on public.master_tire_sizes for select to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin');

create policy "master_tire_patterns_admin_read_all"
on public.master_tire_patterns for select to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin');

-- 3) Superadmin can read every activity log row. The existing
--    "activity_logs_read" policy only matches rows with a survey_id the
--    viewer already has access to, which silently hides admin-only entries
--    (user role changes, master data edits) that carry survey_id = null.
create policy "activity_logs_admin_read_all"
on public.activity_logs for select to authenticated
using (public.current_user_is_active() and public.current_app_role() = 'superadmin');

-- 4) Superadmin can write its own audit trail entries directly (user
--    management, master data edits, manual status corrections). Workflow
--    writes (submit/QC/backend) keep going through their SECURITY DEFINER
--    RPCs, which bypass RLS already.
create policy "activity_logs_admin_insert"
on public.activity_logs for insert to authenticated
with check (
  actor_id = auth.uid()
  and public.current_user_is_active()
  and public.current_app_role() = 'superadmin'
);

commit;

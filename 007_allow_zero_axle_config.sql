-- Migration 007: allow zero-count axle types in Supplier Draft configuration.
--
-- Section 3 always sends the three axle types (STEER, DRIVE, FREE_ROLLING),
-- including types whose selected count is 0. The client requirement explicitly
-- allows 0 for Steer/Drive/Free Rolling. The original schema used axle_count > 0,
-- which caused the Draft save to fail when any axle type was set to 0.

alter table public.survey_axle_configs
  drop constraint if exists survey_axle_configs_axle_count_check;

alter table public.survey_axle_configs
  add constraint survey_axle_configs_axle_count_check
  check (axle_count >= 0);

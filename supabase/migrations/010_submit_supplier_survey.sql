-- Migration 010: Supplier Submit validation + official Serial Number.
-- Server-authoritative validation; no Serial Number is created before successful Submit.

create or replace function public.submit_supplier_survey(p_survey_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_survey public.surveys%rowtype;
  v_user_role public.app_role;
  v_errors text[] := array[]::text[];
  v_total_axles integer := 0;
  v_total_tires integer := 0;
  v_tire_position_count integer := 0;
  v_missing_tire_positions integer := 0;
  v_front_count integer := 0;
  v_rear_count integer := 0;
  v_side_count integer := 0;
  v_serial text;
  v_city_ok boolean := false;
  v_vehicle_brand_ok boolean := false;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('User belum terautentikasi.'));
  end if;

  select role into v_user_role
  from public.users
  where id = auth.uid();

  if v_user_role is distinct from 'supplier'::public.app_role then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Hanya Data Supplier yang dapat melakukan Submit.'));
  end if;

  select * into v_survey
  from public.surveys
  where id = p_survey_id
    and supplier_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Draft survey tidak ditemukan atau bukan milik Supplier ini.'));
  end if;

  if v_survey.status is distinct from 'DRAFT'::public.survey_status then
    return jsonb_build_object('ok', false, 'errors', jsonb_build_array('Survey ini sudah tidak berada pada status DRAFT.'));
  end if;

  -- Section 1
  if v_survey.survey_date is null then
    v_errors := array_append(v_errors, 'Tanggal Survey wajib diisi.');
  end if;

  -- Section 2
  if nullif(trim(v_survey.plate_number), '') is null then
    v_errors := array_append(v_errors, 'Nomor Polisi wajib diisi.');
  end if;

  if v_survey.province_id is null then
    v_errors := array_append(v_errors, 'Provinsi wajib dipilih.');
  elsif not exists (
    select 1 from public.master_provinces p
    where p.id = v_survey.province_id and p.is_active = true
  ) then
    v_errors := array_append(v_errors, 'Provinsi tidak valid.');
  end if;

  if v_survey.city_id is not null then
    select exists (
      select 1 from public.master_cities c
      where c.id = v_survey.city_id
        and c.province_id = v_survey.province_id
        and c.is_active = true
    ) into v_city_ok;
    if not v_city_ok then
      v_errors := array_append(v_errors, 'Kota tidak sesuai dengan provinsi atau tidak valid.');
    end if;
  elsif nullif(trim(v_survey.city_other), '') is null then
    v_errors := array_append(v_errors, 'Kota wajib dipilih atau diisi melalui Lainnya.');
  end if;

  if v_survey.vehicle_category is null then
    v_errors := array_append(v_errors, 'Kategori Kendaraan TB/LT wajib dipilih.');
  end if;

  if v_survey.segment is null then
    v_errors := array_append(v_errors, 'Segmen Utama wajib dipilih.');
  elsif v_survey.segment = 'BUS'::public.segment_type then
    if v_survey.bus_category is null then
      v_errors := array_append(v_errors, 'Kategori Bus wajib dipilih.');
    end if;
  elsif v_survey.segment = 'TRUCK'::public.segment_type then
    if v_survey.truck_category is null then
      v_errors := array_append(v_errors, 'Kategori Truck wajib dipilih.');
    elsif v_survey.truck_category in ('GENERAL_CARGO'::public.truck_category, 'TANKER'::public.truck_category)
      and nullif(trim(v_survey.specific_vehicle_type), '') is null then
      v_errors := array_append(v_errors, 'Jenis spesifik Truck wajib diisi.');
    end if;
  end if;

  if v_survey.vehicle_brand_id is not null then
    select exists (
      select 1 from public.master_vehicle_brands b
      where b.id = v_survey.vehicle_brand_id
        and b.is_active = true
    ) into v_vehicle_brand_ok;
    if not v_vehicle_brand_ok then
      v_errors := array_append(v_errors, 'Merk Kendaraan tidak valid.');
    end if;
  elsif nullif(trim(v_survey.vehicle_brand_other), '') is null then
    v_errors := array_append(v_errors, 'Merk Kendaraan wajib dipilih atau diisi melalui Lainnya.');
  end if;

  -- Section 3: derive axle totals from saved axle configuration.
  select
    coalesce(sum(axle_count), 0),
    coalesce(sum(tire_count), 0)
  into v_total_axles, v_total_tires
  from public.survey_axle_configs
  where survey_id = p_survey_id;

  if v_total_axles = 0 then
    v_errors := array_append(v_errors, 'Konfigurasi poros wajib diisi.');
  elsif v_total_axles < 2 or v_total_axles > 6 then
    v_errors := array_append(v_errors, 'Jumlah poros harus 2 sampai 6 poros.');
  end if;

  if not exists (
    select 1 from public.survey_axle_configs
    where survey_id = p_survey_id and axle_type = 'STEER' and axle_count >= 1
  ) then
    v_errors := array_append(v_errors, 'Steer minimal harus 1 poros.');
  end if;

  if not exists (
    select 1 from public.survey_axle_configs
    where survey_id = p_survey_id and axle_type = 'DRIVE' and axle_count >= 1
  ) then
    v_errors := array_append(v_errors, 'Drive minimal harus 1 poros.');
  end if;

  if exists (
    select 1
    from public.survey_axle_configs
    where survey_id = p_survey_id
      and axle_type = 'FREE_ROLLING'
      and axle_count > 0
  ) and (
    coalesce((select axle_count from public.survey_axle_configs where survey_id = p_survey_id and axle_type = 'STEER'), 0)
    + coalesce((select axle_count from public.survey_axle_configs where survey_id = p_survey_id and axle_type = 'DRIVE'), 0)
  ) < 3 then
    v_errors := array_append(v_errors, 'Free Rolling hanya boleh digunakan jika Steer + Drive minimal 3 poros.');
  end if;

  if exists (
    select 1 from public.survey_axle_configs
    where survey_id = p_survey_id and axle_type = 'STEER' and tire_configuration <> 'SINGLE'
  ) then
    v_errors := array_append(v_errors, 'Konfigurasi ban Steer harus Single.');
  end if;

  -- Section 3/positions must exist before Submit.
  select count(*) into v_tire_position_count
  from public.survey_tires
  where survey_id = p_survey_id;

  if v_total_tires <= 0 then
    v_errors := array_append(v_errors, 'Jumlah ban hasil konfigurasi harus lebih dari 0.');
  elsif v_tire_position_count <> v_total_tires then
    v_errors := array_append(v_errors, format('Posisi ban belum lengkap. Sistem membutuhkan %s posisi, tetapi baru %s tersimpan.', v_total_tires, v_tire_position_count));
  end if;

  -- Every generated tire position requires at least one photo.
  select count(*) into v_missing_tire_positions
  from public.survey_tires st
  where st.survey_id = p_survey_id
    and not exists (
      select 1 from public.tire_photos tp
      where tp.survey_tire_id = st.id
    );

  if v_missing_tire_positions > 0 then
    v_errors := array_append(v_errors, format('%s posisi ban belum memiliki foto.', v_missing_tire_positions));
  end if;

  -- Required vehicle evidence: Front, Rear, Side, at least one each.
  select count(*) into v_front_count
  from public.vehicle_photos vp
  join public.tire_photo_categories pc on pc.id = vp.category_id
  where vp.survey_id = p_survey_id and pc.code = 'FRONT_VIEW' and pc.scope = 'VEHICLE';

  select count(*) into v_rear_count
  from public.vehicle_photos vp
  join public.tire_photo_categories pc on pc.id = vp.category_id
  where vp.survey_id = p_survey_id and pc.code = 'REAR_VIEW' and pc.scope = 'VEHICLE';

  select count(*) into v_side_count
  from public.vehicle_photos vp
  join public.tire_photo_categories pc on pc.id = vp.category_id
  where vp.survey_id = p_survey_id and pc.code = 'SIDE_VIEW' and pc.scope = 'VEHICLE';

  if v_front_count = 0 then
    v_errors := array_append(v_errors, 'Foto Tampak Depan wajib diupload.');
  end if;
  if v_rear_count = 0 then
    v_errors := array_append(v_errors, 'Foto Tampak Belakang wajib diupload.');
  end if;
  if v_side_count = 0 then
    v_errors := array_append(v_errors, 'Foto Tampak Samping wajib diupload.');
  end if;

  if cardinality(v_errors) > 0 then
    return jsonb_build_object(
      'ok', false,
      'errors', to_jsonb(v_errors)
    );
  end if;

  -- Generate the official SN only after all validation succeeds.
  v_serial := public.generate_survey_serial();

  update public.surveys
  set serial_number = v_serial,
      total_axles = v_total_axles,
      total_tires = v_total_tires,
      status = 'SUBMITTED'::public.survey_status,
      submitted_at = now(),
      updated_at = now()
  where id = p_survey_id;

  insert into public.activity_logs(survey_id, actor_id, action, old_value, new_value)
  values (
    p_survey_id,
    auth.uid(),
    'SUPPLIER_SUBMITTED',
    jsonb_build_object('status', 'DRAFT', 'serial_number', null),
    jsonb_build_object('status', 'SUBMITTED', 'serial_number', v_serial)
  );

  return jsonb_build_object(
    'ok', true,
    'serial_number', v_serial,
    'status', 'SUBMITTED'
  );
end;
$$;

grant execute on function public.submit_supplier_survey(uuid) to authenticated;

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateTirePositions,
  tireCountForConfiguration,
} from "@/lib/tire-generator/generate-tire-positions";
import type {
  AxleConfigInput,
  AxleType,
  TireConfiguration,
} from "@/lib/tire-generator/generate-tire-positions";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizePlate(value: string) {
  return value.toUpperCase().replace(/\s+/g, "");
}

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isAxleType(value: unknown): value is AxleType {
  return value === "STEER" || value === "DRIVE" || value === "FREE_ROLLING";
}

function isTireConfiguration(value: unknown): value is TireConfiguration {
  return value === "SINGLE" || value === "DOUBLE";
}

function isValidAxleConfig(value: unknown): value is AxleConfigInput {
  if (!value || typeof value !== "object") return false;
  const config = value as Record<string, unknown>;

  return (
    isAxleType(config.axle_type) &&
    Number.isInteger(config.axle_count) &&
    typeof config.axle_count === "number" &&
    config.axle_count >= 0 &&
    isTireConfiguration(config.tire_configuration)
  );
}

export async function PATCH(
  request: Request,
  { params }: RouteContext
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: "User profile not found." },
      { status: 403 }
    );
  }

  if (!profile.is_active || profile.role !== "supplier") {
    return NextResponse.json(
      { error: "You are not allowed to edit this survey." },
      { status: 403 }
    );
  }

  const { data: existingSurvey, error: surveyError } =
    await supabase
      .from("surveys")
      .select("id, status")
      .eq("id", id)
      .eq("supplier_id", user.id)
      .single();

  if (surveyError || !existingSurvey) {
    return NextResponse.json(
      { error: "Survey tidak ditemukan." },
      { status: 404 }
    );
  }

  if (existingSurvey.status !== "DRAFT" && existingSurvey.status !== "QC_REVISION") {
    return NextResponse.json(
      { error: "Survey ini tidak lagi dapat diedit." },
      { status: 409 }
    );
  }

  const body = await request.json();

  const plateNumber =
    typeof body.plate_number === "string"
      ? normalizePlate(body.plate_number)
      : "";

  if (!plateNumber) {
    return NextResponse.json(
      { error: "Nomor Polisi wajib diisi." },
      { status: 400 }
    );
  }

  if (!body.vehicle_category) {
    return NextResponse.json(
      { error: "Kategori Kendaraan TB/LT wajib dipilih." },
      { status: 400 }
    );
  }

  if (!body.segment) {
    return NextResponse.json(
      { error: "Segmen Utama wajib dipilih." },
      { status: 400 }
    );
  }

  if (
    body.segment === "BUS" &&
    !body.bus_category
  ) {
    return NextResponse.json(
      { error: "Kategori Bus wajib dipilih." },
      { status: 400 }
    );
  }

  if (
    body.segment === "TRUCK" &&
    !body.truck_category
  ) {
    return NextResponse.json(
      { error: "Kategori Truck wajib dipilih." },
      { status: 400 }
    );
  }

  if (
    body.truck_category === "GENERAL_CARGO" &&
    !isNonEmptyString(body.specific_vehicle_type)
  ) {
    return NextResponse.json(
      { error: "Spesifik Cargo wajib dipilih." },
      { status: 400 }
    );
  }

  if (
    body.truck_category === "TANKER" &&
    !isNonEmptyString(body.specific_vehicle_type)
  ) {
    return NextResponse.json(
      { error: "Spesifik Tanker wajib dipilih." },
      { status: 400 }
    );
  }

  const cityId =
    typeof body.city_id === "number"
      ? body.city_id
      : null;

  const cityOther =
    cityId === null && isNonEmptyString(body.city_other)
      ? body.city_other.trim()
      : null;

  if (cityId === null && cityOther === null) {
    return NextResponse.json(
      {
        error:
          "Kota wajib dipilih atau diisi pada pilihan Lainnya.",
      },
      { status: 400 }
    );
  }

  const vehicleBrandId =
    typeof body.vehicle_brand_id === "number"
      ? body.vehicle_brand_id
      : null;

  const vehicleBrandOther =
    vehicleBrandId === null &&
    isNonEmptyString(body.vehicle_brand_other)
      ? body.vehicle_brand_other.trim()
      : null;

  if (
    vehicleBrandId === null &&
    vehicleBrandOther === null
  ) {
    return NextResponse.json(
      {
        error:
          "Merk Kendaraan wajib dipilih atau diisi pada pilihan Lainnya.",
      },
      { status: 400 }
    );
  }

  const { data: plateAvailable, error: plateCheckError } =
    await supabase.rpc("is_plate_available", {
      p_plate: plateNumber,
      p_survey_id: id,
    });

  if (plateCheckError) {
    console.error(
      "Plate availability check failed:",
      plateCheckError
    );

    return NextResponse.json(
      {
        error:
          "Gagal memeriksa nomor polisi. Silakan coba lagi.",
      },
      { status: 500 }
    );
  }

  if (!plateAvailable) {
    return NextResponse.json(
      {
        error:
          "Nomor Polisi sudah terdaftar dan masih aktif di sistem.",
        code: "DUPLICATE_PLATE",
      },
      { status: 409 }
    );
  }

  const rawAxleConfigs = Array.isArray(body.axle_configs)
    ? body.axle_configs
    : null;

  if (!rawAxleConfigs || rawAxleConfigs.length !== 3 || !rawAxleConfigs.every(isValidAxleConfig)) {
    return NextResponse.json(
      {
        error:
          "Konfigurasi poros belum lengkap. Steer, Drive, dan Free Rolling harus dikirim.",
      },
      { status: 400 }
    );
  }

  const axleConfigs = rawAxleConfigs as AxleConfigInput[];
  const totalAxles = axleConfigs.reduce(
    (sum, config) => sum + config.axle_count,
    0
  );

  if (![0, 2, 3, 4, 5, 6].includes(totalAxles)) {
    return NextResponse.json(
      { error: "Jumlah Poros hasil konfigurasi harus 0 atau salah satu dari 2, 3, 4, 5, atau 6." },
      { status: 400 }
    );
  }

  const uniqueTypes = new Set(axleConfigs.map((config) => config.axle_type));
  if (uniqueTypes.size !== 3) {
    return NextResponse.json(
      { error: "Setiap tipe poros hanya boleh muncul satu kali." },
      { status: 400 }
    );
  }

  const steer = axleConfigs.find((config) => config.axle_type === "STEER")!;
  const drive = axleConfigs.find((config) => config.axle_type === "DRIVE")!;
  const freeRolling = axleConfigs.find((config) => config.axle_type === "FREE_ROLLING")!;

  if (steer.axle_count > 2 || drive.axle_count > 2 || freeRolling.axle_count > 5) {
    return NextResponse.json(
      { error: "Jumlah poros pada konfigurasi melebihi batas pilihan yang ditentukan." },
      { status: 400 }
    );
  }

  const baseAxles = steer.axle_count + drive.axle_count;

  if (totalAxles > 0 && steer.axle_count === 0) {
  return NextResponse.json(
    {
      error:
        "Konfigurasi tidak valid: Steer minimal harus 1 poros.",
    },
    { status: 400 }
  );
}

  if (totalAxles > 0 && drive.axle_count === 0) {
    return NextResponse.json(
      {
        error:
          "Konfigurasi tidak valid: Drive minimal harus 1 poros.",
      },
      { status: 400 }
    );
  }

  if (freeRolling.axle_count > 0 && baseAxles < 3) {
    return NextResponse.json(
      {
        error:
          "Free Rolling hanya dapat digunakan setelah Steer + Drive berjumlah minimal 3 poros.",
      },
      { status: 400 }
    );
  }

  const totalTires = axleConfigs.reduce(
    (sum, config) =>
      sum + tireCountForConfiguration(config.axle_count, config.tire_configuration),
    0
  );

  const { data: survey, error: updateError } =
    await supabase
      .from("surveys")
      .update({
        survey_date:
          typeof body.survey_date === "string"
            ? body.survey_date
            : undefined,
        plate_number: plateNumber,
        province_id:
          typeof body.province_id === "number"
            ? body.province_id
            : null,
        city_id: cityId,
        city_other: cityOther,
        vehicle_category: body.vehicle_category,
        segment: body.segment,
        bus_category:
          body.segment === "BUS" ? body.bus_category : null,
        truck_category:
          body.segment === "TRUCK" ? body.truck_category : null,
        specific_vehicle_type:
          isNonEmptyString(body.specific_vehicle_type)
            ? body.specific_vehicle_type.trim()
            : null,
        company_name:
          isNonEmptyString(body.company_name)
            ? body.company_name.trim()
            : null,
        vehicle_brand_id: vehicleBrandId,
        vehicle_brand_other: vehicleBrandOther,
        cargo_type:
          isNonEmptyString(body.cargo_type)
            ? body.cargo_type.trim()
            : null,
        total_axles: totalAxles,
        total_tires: totalTires,
      })
      .eq("id", id)
      .eq("supplier_id", user.id)
      .in("status", ["DRAFT", "QC_REVISION"])
      .select(
        "id, survey_date, plate_number, province_id, city_id, city_other, vehicle_category, segment, bus_category, truck_category, specific_vehicle_type, company_name, vehicle_brand_id, vehicle_brand_other, cargo_type, total_axles, total_tires, status, updated_at"
      )
      .single();

  if (updateError || !survey) {
    console.error(
      "Update survey failed:",
      updateError
    );

    return NextResponse.json(
      { error: "Gagal menyimpan data survey." },
      { status: 500 }
    );
  }

  const normalizedConfigs = axleConfigs.map((config, index) => ({
    survey_id: id,
    axle_order: index + 1,
    axle_type: config.axle_type,
    axle_count: config.axle_count,
    tire_configuration: config.tire_configuration,
    tire_count: tireCountForConfiguration(
      config.axle_count,
      config.tire_configuration
    ),
  }));

  const { error: axleUpsertError } = await supabase
    .from("survey_axle_configs")
    .upsert(normalizedConfigs, {
      onConflict: "survey_id,axle_type",
    });

  if (axleUpsertError) {
    console.error("Upsert axle configs failed:", axleUpsertError);
    return NextResponse.json(
      { error: "Data kendaraan tersimpan, tetapi konfigurasi poros gagal disimpan." },
      { status: 500 }
    );
  }

  const { error: obsoleteAxlesError } = await supabase
    .from("survey_axle_configs")
    .delete()
    .eq("survey_id", id)
    .not("axle_type", "in", "(STEER,DRIVE,FREE_ROLLING)");

  if (obsoleteAxlesError) {
    console.error("Delete obsolete axle configs failed:", obsoleteAxlesError);
  }

  const { data: savedAxles, error: savedAxlesError } = await supabase
    .from("survey_axle_configs")
    .select("id, axle_type, axle_count, tire_configuration")
    .eq("survey_id", id);

  if (savedAxlesError || !savedAxles) {
    console.error("Load saved axle configs failed:", savedAxlesError);
    return NextResponse.json(
      { error: "Konfigurasi poros tersimpan, tetapi posisi ban gagal dibuat." },
      { status: 500 }
    );
  }

  const savedAxleMap = new Map(
    savedAxles.map((axle) => [axle.axle_type as AxleType, axle])
  );

  const desiredPositions = generateTirePositions(axleConfigs);
  const positionPayload = desiredPositions.map((position) => {
    const axle = savedAxleMap.get(position.axle_type);

    if (!axle) {
      throw new Error(`Axle ${position.axle_type} tidak ditemukan setelah disimpan.`);
    }

    return {
      survey_id: id,
      axle_id: axle.id,
      axle_type: position.axle_type,
      axle_number: position.axle_number,
      position_code: position.position_code,
      position_name: position.position_name,
      side: position.side,
      tire_layer: position.tire_layer,
      tire_sequence: position.tire_sequence,
    };
  });

  const desiredCodes = desiredPositions.map((position) => position.position_code);

  const { data: currentTires, error: currentTiresError } = await supabase
    .from("survey_tires")
    .select("id, position_code")
    .eq("survey_id", id);

  if (currentTiresError || !currentTires) {
    console.error("Load current tires failed:", currentTiresError);
    return NextResponse.json(
      { error: "Posisi ban saat ini gagal dibaca." },
      { status: 500 }
    );
  }

  const obsoleteTireIds = currentTires
    .filter((tire) => !desiredCodes.includes(tire.position_code))
    .map((tire) => tire.id);

  if (obsoleteTireIds.length > 0) {
    const { error: obsoleteTiresError } = await supabase
      .from("survey_tires")
      .delete()
      .in("id", obsoleteTireIds);

    if (obsoleteTiresError) {
      console.error("Delete obsolete tires failed:", obsoleteTiresError);
      return NextResponse.json(
        { error: "Posisi ban lama gagal disesuaikan." },
        { status: 500 }
      );
    }
  }

  if (positionPayload.length > 0) {
    const { error: tireUpsertError } = await supabase
      .from("survey_tires")
      .upsert(positionPayload, {
        onConflict: "survey_id,position_code",
      });

    if (tireUpsertError) {
      console.error("Upsert tire positions failed:", tireUpsertError);
      return NextResponse.json(
        { error: "Posisi ban gagal dibuat." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    data: survey,
    axle_configs: normalizedConfigs,
    tire_positions: desiredPositions,
    total_tires: totalTires,
  });
}

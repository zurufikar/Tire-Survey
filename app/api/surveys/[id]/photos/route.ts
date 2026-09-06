import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateTirePositions } from "@/lib/tire-generator/generate-tire-positions";

const BUCKET = "survey-photos";
const MAX_TIRE_PHOTOS = 10;
const VEHICLE_CODES = new Set(["FRONT_VIEW", "REAR_VIEW", "SIDE_VIEW"]);
const AXLE_TYPES = new Set(["STEER", "DRIVE", "FREE_ROLLING"]);
const TIRE_CONFIGS = new Set(["SINGLE", "DOUBLE"]);

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function getSupplierDraft(surveyId: string) {
  const { profile } = await requireRole(["supplier"]);
  const supabase = await createClient();

  const { data: survey, error } = await supabase
    .from("surveys")
    .select("id, supplier_id, status")
    .eq("id", surveyId)
    .eq("supplier_id", profile.id)
    .in("status", ["DRAFT", "QC_REVISION"])
    .maybeSingle();

  return { profile, supabase, survey, error };
}

function parseAxleConfigs(raw: unknown) {
  const value: unknown =
    Array.isArray(raw)
      ? raw
      : typeof raw === "string" && raw.trim()
        ? JSON.parse(raw)
        : null;
  if (!Array.isArray(value)) throw new Error("Konfigurasi poros tidak valid.");

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Konfigurasi poros tidak valid.");
    }

    const row = item as Record<string, unknown>;
    const axleType = String(row.axle_type ?? "");
    const axleCount = Number(row.axle_count);
    const tireConfiguration = String(row.tire_configuration ?? "");

    if (!AXLE_TYPES.has(axleType)) {
      throw new Error("Tipe poros tidak valid.");
    }
    if (!Number.isInteger(axleCount) || axleCount < 0 || axleCount > 5) {
      throw new Error("Jumlah poros tidak valid.");
    }
    if (!TIRE_CONFIGS.has(tireConfiguration)) {
      throw new Error("Konfigurasi ban tidak valid.");
    }

    return {
      axle_type: axleType as "STEER" | "DRIVE" | "FREE_ROLLING",
      axle_count: axleCount,
      tire_configuration: tireConfiguration as "SINGLE" | "DOUBLE",
    };
  });
}

async function ensureTirePosition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  surveyId: string,
  positionCode: string,
  rawAxleConfigs: string,
) {
  const { data: existing, error: existingError } = await supabase
    .from("survey_tires")
    .select("id, position_code")
    .eq("survey_id", surveyId)
    .eq("position_code", positionCode)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Gagal mencari posisi ban: ${existingError.message}`);
  }
  if (existing) return existing.id;
  if (!rawAxleConfigs) {
    throw new Error("Konfigurasi poros belum tersedia.");
  }

  const axleConfigs = parseAxleConfigs(rawAxleConfigs);
  const generated = generateTirePositions(axleConfigs);
  const target = generated.find((position) => position.position_code === positionCode);

  if (!target) {
    throw new Error("Posisi ban tidak sesuai konfigurasi poros saat ini.");
  }

  const config = axleConfigs.find((row) => row.axle_type === target.axle_type);
  if (!config || config.axle_count <= 0) {
    throw new Error("Konfigurasi poros untuk posisi tersebut tidak valid.");
  }

  const axleOrder = target.axle_type === "STEER" ? 1 : target.axle_type === "DRIVE" ? 2 : 3;
  const tireCount =
    config.axle_count *
    2 *
    (config.tire_configuration === "DOUBLE" ? 2 : 1);

  const { data: axle, error: axleError } = await supabase
    .from("survey_axle_configs")
    .upsert(
      {
        survey_id: surveyId,
        axle_order: axleOrder,
        axle_type: config.axle_type,
        axle_count: config.axle_count,
        tire_configuration: config.tire_configuration,
        tire_count: tireCount,
      },
      { onConflict: "survey_id,axle_type" },
    )
    .select("id")
    .single();

  if (axleError || !axle) {
    throw new Error(
      `Gagal menyiapkan konfigurasi poros: ${axleError?.message ?? "unknown error"}`,
    );
  }

  const { data: tire, error: tireError } = await supabase
    .from("survey_tires")
    .upsert(
      {
        survey_id: surveyId,
        axle_id: axle.id,
        axle_type: target.axle_type,
        axle_number: target.axle_number,
        position_code: target.position_code,
        position_name: target.position_name,
        side: target.side,
        tire_layer: target.tire_layer,
        tire_sequence: target.tire_sequence,
      },
      { onConflict: "survey_id,position_code" },
    )
    .select("id")
    .single();

  if (tireError || !tire) {
    throw new Error(
      `Gagal membuat posisi ban: ${tireError?.message ?? "unknown error"}`,
    );
  }

  return tire.id;
}

async function signedUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePath: string,
) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60 * 60);
  return error ? null : data?.signedUrl ?? null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { supabase, survey, error } = await getSupplierDraft(id);

  if (error || !survey) {
    return errorResponse("Survey tidak ditemukan, bukan milik Supplier ini, atau tidak dapat diedit pada status saat ini.", 404);
  }

  const [categories, vehicles, tires, positions] = await Promise.all([
    supabase
      .from("tire_photo_categories")
      .select("id, code, name, scope, is_required, max_photos, sort_order")
      .order("sort_order"),
    supabase
      .from("vehicle_photos")
      .select("id, category_id, storage_path, created_at")
      .eq("survey_id", id)
      .order("created_at"),
    supabase
      .from("tire_photos")
      .select("id, survey_tire_id, category_id, storage_path, created_at")
      .not("survey_tire_id", "is", null)
      .order("created_at"),
    supabase
      .from("survey_tires")
      .select("id, position_code, position_name, side")
      .eq("survey_id", id),
  ]);

  if (categories.error) return errorResponse(`Gagal memuat kategori: ${categories.error.message}`, 500);
  if (vehicles.error) return errorResponse(`Gagal memuat foto kendaraan: ${vehicles.error.message}`, 500);
  if (tires.error) return errorResponse(`Gagal memuat foto ban: ${tires.error.message}`, 500);
  if (positions.error) return errorResponse(`Gagal memuat posisi ban: ${positions.error.message}`, 500);

  const categoryMap = new Map((categories.data ?? []).map((row) => [row.id, row]));
  const positionMap = new Map((positions.data ?? []).map((row) => [row.id, row]));

  const vehiclePhotos = await Promise.all(
    (vehicles.data ?? []).map(async (photo) => {
      const category = categoryMap.get(photo.category_id);
      if (!category) return null;
      return {
        id: photo.id,
        categoryId: photo.category_id,
        categoryCode: category.code,
        categoryName: category.name,
        signedUrl: await signedUrl(supabase, photo.storage_path),
        storagePath: photo.storage_path,
        createdAt: photo.created_at,
      };
    }),
  );

  const tirePhotos = await Promise.all(
    (tires.data ?? []).map(async (photo) => {
      const category = categoryMap.get(photo.category_id);
      const position = positionMap.get(photo.survey_tire_id);
      if (!category || !position) return null;
      return {
        id: photo.id,
        categoryId: photo.category_id,
        categoryCode: category.code,
        categoryName: category.name,
        signedUrl: await signedUrl(supabase, photo.storage_path),
        storagePath: photo.storage_path,
        createdAt: photo.created_at,
        tirePositionId: position.id,
        positionName: position.position_name,
        positionCode: position.position_code,
        side: position.side,
      };
    }),
  );

  return NextResponse.json({
    categories: categories.data ?? [],
    vehiclePhotos: vehiclePhotos.filter(Boolean),
    tirePhotos: tirePhotos.filter(Boolean),
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { profile, supabase, survey, error } = await getSupplierDraft(id);

  if (error || !survey) {
    return errorResponse("Survey tidak ditemukan, bukan milik Supplier ini, atau tidak dapat diedit pada status saat ini.", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Payload foto tidak valid.");
  }

  if (!body || typeof body !== "object") return errorResponse("Payload foto tidak valid.");

  const row = body as Record<string, unknown>;
  const scope = String(row.scope ?? "");
  const categoryId = Number(row.category_id);
  const storagePath = String(row.storage_path ?? "").trim();
  const positionCode = String(row.position_code ?? "").trim();
  const tirePositionId = String(row.tire_position_id ?? "").trim();
  const rawAxleConfigs = row.axle_configs;

  if (scope !== "VEHICLE" && scope !== "TIRE") return errorResponse("Scope foto tidak valid.");
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) return errorResponse("Kategori foto tidak valid.");
  if (!storagePath || !storagePath.startsWith(`${id}/`)) return errorResponse("Storage path tidak valid.");

  const { data: category, error: categoryError } = await supabase
    .from("tire_photo_categories")
    .select("id, code, name, scope, max_photos")
    .eq("id", categoryId)
    .maybeSingle();

  if (categoryError || !category) return errorResponse("Kategori foto tidak ditemukan.", 404);
  if (category.scope !== scope) return errorResponse("Kategori foto tidak sesuai scope.");

  if (scope === "VEHICLE") {
    if (!VEHICLE_CODES.has(category.code)) return errorResponse("Kategori foto kendaraan tidak valid.");

    const { count, error: countError } = await supabase
      .from("vehicle_photos")
      .select("id", { count: "exact", head: true })
      .eq("survey_id", id)
      .eq("category_id", categoryId);

    if (countError) return errorResponse(`Gagal menghitung foto kendaraan: ${countError.message}`, 500);
    if ((count ?? 0) >= Math.min(category.max_photos ?? MAX_TIRE_PHOTOS, MAX_TIRE_PHOTOS)) {
      return errorResponse("Maksimal 10 foto untuk kategori ini.");
    }

    const { data, error: insertError } = await supabase
      .from("vehicle_photos")
      .insert({
        survey_id: id,
        category_id: categoryId,
        storage_path: storagePath,
        uploaded_by: profile.id,
      })
      .select("id, created_at")
      .single();

    if (insertError || !data) {
      return errorResponse(`Metadata foto kendaraan gagal disimpan: ${insertError?.message ?? "unknown error"}`, 500);
    }

    return NextResponse.json({
      photo: {
        id: data.id,
        categoryId,
        categoryCode: category.code,
        categoryName: category.name,
        signedUrl: null,
        storagePath,
        createdAt: data.created_at,
      },
    });
  }

  if (!positionCode) {
    return errorResponse("Position code wajib diisi untuk foto ban.");
  }

  let resolvedTirePositionId: string;
  try {
    if (tirePositionId) {
      const { data: existingPosition, error: existingPositionError } =
        await supabase
          .from("survey_tires")
          .select("id")
          .eq("id", tirePositionId)
          .eq("survey_id", id)
          .maybeSingle();

      if (existingPositionError) {
        throw new Error(
          `Gagal memeriksa posisi ban: ${existingPositionError.message}`
        );
      }

      if (!existingPosition) {
        throw new Error("Posisi ban tidak ditemukan pada survey ini.");
      }

      resolvedTirePositionId = existingPosition.id;
    } else {
      if (!positionCode) {
        throw new Error("Position code wajib diisi untuk foto ban.");
      }

      resolvedTirePositionId = await ensureTirePosition(
        supabase,
        id,
        positionCode,
        rawAxleConfigs
      );
    }
  } catch (positionError) {
    return errorResponse(
      positionError instanceof Error ? positionError.message : "Posisi ban gagal disiapkan.",
      400,
    );
  }

  const { count, error: countError } = await supabase
    .from("tire_photos")
    .select("id", { count: "exact", head: true })
    .eq("survey_tire_id", resolvedTirePositionId);

  if (countError) return errorResponse(`Gagal menghitung foto ban: ${countError.message}`, 500);
  if ((count ?? 0) >= MAX_TIRE_PHOTOS) return errorResponse("Maksimal 10 foto untuk posisi ban ini.");

  const { data: position, error: positionError } = await supabase
    .from("survey_tires")
    .select("id, position_name, position_code, side")
    .eq("id", resolvedTirePositionId)
    .single();

  if (positionError || !position) {
    return errorResponse(`Posisi ban tidak ditemukan: ${positionError?.message ?? "unknown error"}`, 500);
  }

  const { data, error: insertError } = await supabase
    .from("tire_photos")
    .insert({
      survey_tire_id: resolvedTirePositionId,
      category_id: categoryId,
      storage_path: storagePath,
      uploaded_by: profile.id,
    })
    .select("id, created_at")
    .single();

  if (insertError || !data) {
    return errorResponse(`Metadata foto ban gagal disimpan: ${insertError?.message ?? "unknown error"}`, 500);
  }

  return NextResponse.json({
    photo: {
      id: data.id,
      categoryId,
      categoryCode: category.code,
      categoryName: category.name,
      signedUrl: null,
      storagePath,
      createdAt: data.created_at,
      tirePositionId: position.id,
      positionName: position.position_name,
      positionCode: position.position_code,
      side: position.side,
    },
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { supabase, survey, error } = await getSupplierDraft(id);

  if (error || !survey) {
    return errorResponse("Survey tidak ditemukan, bukan milik Supplier ini, atau tidak dapat diedit pada status saat ini.", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Payload delete tidak valid.");
  }

  const photoId =
    body && typeof body === "object"
      ? String((body as Record<string, unknown>).photo_id ?? "").trim()
      : "";

  if (!photoId) return errorResponse("ID foto wajib diisi.");

  const vehicle = await supabase
    .from("vehicle_photos")
    .select("id, storage_path")
    .eq("id", photoId)
    .eq("survey_id", id)
    .maybeSingle();

  if (vehicle.error) return errorResponse(`Gagal mencari foto kendaraan: ${vehicle.error.message}`, 500);

  if (vehicle.data) {
    const { data: deleted, error: deleteError } = await supabase
      .from("vehicle_photos")
      .delete()
      .eq("id", photoId)
      .eq("survey_id", id)
      .select("id")
      .maybeSingle();

    if (deleteError) return errorResponse(`Foto gagal dihapus: ${deleteError.message}`, 500);
    if (!deleted) return errorResponse("Foto kendaraan tidak berhasil dihapus.", 409);

    return NextResponse.json({ success: true, storagePath: vehicle.data.storage_path });
  }

  const tire = await supabase
    .from("tire_photos")
    .select("id, storage_path, survey_tire_id")
    .eq("id", photoId)
    .maybeSingle();

  if (tire.error) return errorResponse(`Gagal mencari foto ban: ${tire.error.message}`, 500);
  if (!tire.data) return errorResponse("Foto tidak ditemukan.", 404);

  const owner = await supabase
    .from("survey_tires")
    .select("id")
    .eq("id", tire.data.survey_tire_id)
    .eq("survey_id", id)
    .maybeSingle();

  if (owner.error) return errorResponse(`Gagal memeriksa foto ban: ${owner.error.message}`, 500);
  if (!owner.data) return errorResponse("Foto bukan milik Draft ini.", 404);

  const { data: deleted, error: deleteError } = await supabase
    .from("tire_photos")
    .delete()
    .eq("id", photoId)
    .select("id")
    .maybeSingle();

  if (deleteError) return errorResponse(`Foto gagal dihapus: ${deleteError.message}`, 500);
  if (!deleted) return errorResponse("Foto ban tidak berhasil dihapus.", 409);

  return NextResponse.json({ success: true, storagePath: tire.data.storage_path });
}

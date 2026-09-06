import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generateTirePositions } from "@/lib/tire-generator/generate-tire-positions";

const BUCKET = "survey-photos";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PHOTOS_PER_SLOT = 10;
const MAX_UPLOAD_FILES = 10;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VEHICLE_CODES = new Set(["FRONT_VIEW", "REAR_VIEW", "SIDE_VIEW"]);

type AxleConfig = {
  axle_type: "STEER" | "DRIVE" | "FREE_ROLLING";
  axle_count: number;
  tire_configuration: "SINGLE" | "DOUBLE";
};

type GeneratedTirePosition = {
  axle_type: "STEER" | "DRIVE" | "FREE_ROLLING";
  axle_number: number;
  position_code: string;
  position_name: string;
  side: "LEFT" | "RIGHT";
  tire_layer: "SINGLE" | "INNER" | "OUTER";
  tire_sequence: number;
};

function jsonError(message: unknown, status = 400) {
  const safeMessage = message instanceof Error ? message.message : String(message ?? "Terjadi kesalahan.");
  return NextResponse.json({ error: safeMessage }, { status });
}

function getExtension(fileType: string) {
  switch (fileType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

async function getSupplierDraft(surveyId: string) {
  const { profile } = await requireRole(["supplier"]);
  const supabase = await createClient();

  const { data: survey, error } = await supabase
    .from("surveys")
    .select("id, supplier_id, status")
    .eq("id", surveyId)
    .eq("supplier_id", profile.id)
    .eq("status", "DRAFT")
    .maybeSingle();

  return { profile, supabase, survey, error };
}

async function signedUrl(supabase: Awaited<ReturnType<typeof createClient>>, path: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error) {
    return null;
  }

  return data?.signedUrl ?? null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { supabase, survey, error: surveyError } = await getSupplierDraft(id);

  if (surveyError || !survey) {
    return jsonError("Draft survey tidak ditemukan atau bukan milik Supplier ini.", 404);
  }

  const [categoriesResult, vehicleResult, tireResult, positionsResult] = await Promise.all([
    supabase
      .from("tire_photo_categories")
      .select("id, code, name, scope, is_required, max_photos, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("vehicle_photos")
      .select("id, category_id, storage_path, created_at")
      .eq("survey_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("tire_photos")
      .select("id, survey_tire_id, category_id, storage_path, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("survey_tires")
      .select("id, survey_id, position_code, position_name, side")
      .eq("survey_id", id),
  ]);

  if (categoriesResult.error) {
    return jsonError(
      `Gagal memuat master kategori foto: ${categoriesResult.error.message}`,
      500
    );
  }

  if (vehicleResult.error) {
    return jsonError(
      `Gagal memuat foto kendaraan: ${vehicleResult.error.message}`,
      500
    );
  }

  if (tireResult.error) {
    return jsonError(
      `Gagal memuat foto ban: ${tireResult.error.message}`,
      500
    );
  }

  if (positionsResult.error) {
    return jsonError(
      `Gagal memuat posisi ban: ${positionsResult.error.message}`,
      500
    );
  }

  const categoryMap = new Map(
    (categoriesResult.data ?? []).map((category) => [category.id, category])
  );
  const positionMap = new Map(
    (positionsResult.data ?? []).map((position) => [position.id, position])
  );

  const vehiclePhotos = await Promise.all(
    (vehicleResult.data ?? []).flatMap((photo) => {
      const category = categoryMap.get(photo.category_id);
      if (!category) return [];

      return [
        signedUrl(supabase, photo.storage_path).then((url) => ({
          id: photo.id,
          categoryId: photo.category_id,
          categoryCode: category.code,
          categoryName: category.name,
          signedUrl: url,
          createdAt: photo.created_at,
        })),
      ];
    })
  );

  const tirePhotos = await Promise.all(
    (tireResult.data ?? []).flatMap((photo) => {
      const category = categoryMap.get(photo.category_id);
      const position = positionMap.get(photo.survey_tire_id);

      if (!category || !position) return [];

      return [
        signedUrl(supabase, photo.storage_path).then((url) => ({
          id: photo.id,
          categoryId: photo.category_id,
          categoryCode: category.code,
          categoryName: category.name,
          signedUrl: url,
          createdAt: photo.created_at,
          tirePositionId: position.id,
          positionName: position.position_name,
          positionCode: position.position_code,
          side: position.side,
        })),
      ];
    })
  );

  return NextResponse.json({
    categories: categoriesResult.data ?? [],
    vehiclePhotos,
    tirePhotos,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { supabase, profile, survey, error: surveyError } = await getSupplierDraft(id);

  if (surveyError || !survey) {
    return jsonError("Draft survey tidak ditemukan atau bukan milik Supplier ini.", 404);
  }

  const formData = await request.formData();
  const scope = String(formData.get("scope") ?? "");
  const categoryId = Number(formData.get("category_id"));
  const positionCode = String(formData.get("position_code") ?? "").trim();
  const tirePositionId = String(formData.get("tire_position_id") ?? "").trim();
  const rawAxleConfigs = String(formData.get("axle_configs") ?? "");
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (scope !== "VEHICLE" && scope !== "TIRE") {
    return jsonError("Scope foto tidak valid.");
  }

  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
    return jsonError("Kategori foto tidak valid.");
  }

  if (files.length === 0) {
    return jsonError("Pilih minimal satu foto.");
  }

  if (files.length > MAX_UPLOAD_FILES) {
    return jsonError(`Maksimal ${MAX_UPLOAD_FILES} foto dalam satu upload.`);
  }

  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return jsonError("Format foto harus JPG, PNG, atau WebP.");
    }

    if (file.size > MAX_FILE_SIZE) {
      return jsonError("Ukuran setiap foto maksimal 10 MB.");
    }
  }

  const { data: category, error: categoryError } = await supabase
    .from("tire_photo_categories")
    .select("id, code, scope, max_photos")
    .eq("id", categoryId)
    .maybeSingle();

  if (categoryError) {
    return jsonError(
      `Gagal memuat kategori foto: ${categoryError.message}`,
      500
    );
  }

  if (!category) {
    return jsonError("Kategori foto tidak ditemukan.", 404);
  }

  if (category.scope !== scope) {
    return jsonError("Kategori foto tidak sesuai dengan jenis upload.");
  }

  if (scope === "VEHICLE" && !VEHICLE_CODES.has(category.code)) {
    return jsonError("Kategori foto kendaraan tidak valid.");
  }

  let positionId: string | null = null;
  let storageFolder: string;

  if (scope === "VEHICLE") {
    const { count, error } = await supabase
      .from("vehicle_photos")
      .select("id", { count: "exact", head: true })
      .eq("survey_id", id)
      .eq("category_id", categoryId);

    if (error) {
      return jsonError(`Gagal menghitung foto kendaraan: ${error.message}`, 500);
    }

    const maxPhotos = Math.min(category.max_photos ?? MAX_PHOTOS_PER_SLOT, MAX_PHOTOS_PER_SLOT);
    if ((count ?? 0) + files.length > maxPhotos) {
      return jsonError(`Maksimal ${maxPhotos} foto untuk slot ini.`);
    }

    storageFolder = `vehicle/${category.code}`;
  } else {
    if (!positionCode) {
      return jsonError("Position code wajib diisi untuk foto ban.");
    }

    if (tirePositionId) {
      const { data: tire, error } = await supabase
        .from("survey_tires")
        .select("id, position_code")
        .eq("id", tirePositionId)
        .eq("survey_id", id)
        .maybeSingle();

      if (error) {
        return jsonError(`Gagal memeriksa posisi ban: ${error.message}`, 500);
      }

      if (tire) {
        if (tire.position_code !== positionCode) {
          return jsonError("Posisi ban tidak sesuai.");
        }
        positionId = tire.id;
      }
    }

    if (!positionId) {
      const { data: tire, error } = await supabase
        .from("survey_tires")
        .select("id")
        .eq("survey_id", id)
        .eq("position_code", positionCode)
        .maybeSingle();

      if (error) {
        return jsonError(`Gagal mencari posisi ban: ${error.message}`, 500);
      }

      positionId = tire?.id ?? null;
    }

    if (!positionId) {
      if (!rawAxleConfigs) {
        return jsonError(
          "Posisi ban belum tersimpan. Simpan konfigurasi poros terlebih dahulu."
        );
      }

      let axleConfigs: AxleConfig[];
      try {
        const parsed: unknown = JSON.parse(rawAxleConfigs);
        if (!Array.isArray(parsed)) throw new Error("invalid");
        axleConfigs = parsed as AxleConfig[];
      } catch {
        return jsonError("Konfigurasi poros tidak valid.");
      }

      const generated = generateTirePositions(axleConfigs) as GeneratedTirePosition[];
      const target = generated.find((item) => item.position_code === positionCode);

      if (!target) {
        return jsonError("Posisi ban tidak sesuai dengan konfigurasi poros saat ini.");
      }

      const config = axleConfigs.find((item) => item.axle_type === target.axle_type);
      if (!config || config.axle_count <= 0) {
        return jsonError("Konfigurasi poros untuk posisi ban tidak valid.");
      }

      const axleOrder =
        target.axle_type === "STEER" ? 1 : target.axle_type === "DRIVE" ? 2 : 3;
      const tireCount =
        config.axle_count * 2 * (config.tire_configuration === "DOUBLE" ? 2 : 1);

      const { data: axle, error: axleError } = await supabase
        .from("survey_axle_configs")
        .upsert(
          {
            survey_id: id,
            axle_order: axleOrder,
            axle_type: target.axle_type,
            axle_count: config.axle_count,
            tire_configuration: config.tire_configuration,
            tire_count: tireCount,
          },
          { onConflict: "survey_id,axle_type" }
        )
        .select("id")
        .single();

      if (axleError || !axle) {
        return jsonError(
          `Gagal menyiapkan konfigurasi poros: ${axleError?.message ?? "unknown error"}`,
          500
        );
      }

      const { data: tire, error: tireError } = await supabase
        .from("survey_tires")
        .upsert(
          {
            survey_id: id,
            axle_id: axle.id,
            axle_type: target.axle_type,
            axle_number: target.axle_number,
            position_code: target.position_code,
            position_name: target.position_name,
            side: target.side,
            tire_layer: target.tire_layer,
            tire_sequence: target.tire_sequence,
          },
          { onConflict: "survey_id,position_code" }
        )
        .select("id")
        .single();

      if (tireError || !tire) {
        return jsonError(
          `Gagal membuat posisi ban: ${tireError?.message ?? "unknown error"}`,
          500
        );
      }

      positionId = tire.id;
    }

    const { count, error } = await supabase
      .from("tire_photos")
      .select("id", { count: "exact", head: true })
      .eq("survey_tire_id", positionId);

    if (error) {
      return jsonError(`Gagal menghitung foto ban: ${error.message}`, 500);
    }

    if ((count ?? 0) + files.length > MAX_PHOTOS_PER_SLOT) {
      return jsonError(`Maksimal ${MAX_PHOTOS_PER_SLOT} foto untuk satu posisi ban.`);
    }

    storageFolder = `tire/${positionCode}`;
  }

  const uploadedPaths: string[] = [];
  const insertedIds: string[] = [];

  try {
    for (const file of files) {
      const extension = getExtension(file.type);
      if (!extension) throw new Error("Extension file tidak valid.");

      const storagePath = `${id}/${storageFolder}/${crypto.randomUUID()}.${extension}`;

      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (storageError) {
        throw new Error(`Upload Storage gagal: ${storageError.message}`);
      }

      uploadedPaths.push(storagePath);

      if (scope === "VEHICLE") {
        const { data, error } = await supabase
          .from("vehicle_photos")
          .insert({
            survey_id: id,
            category_id: categoryId,
            storage_path: storagePath,
            uploaded_by: profile.id,
          })
          .select("id")
          .single();

        if (error || !data) {
          throw new Error(
            `Metadata foto kendaraan gagal disimpan: ${error?.message ?? "unknown error"}`
          );
        }

        insertedIds.push(data.id);
      } else {
        const { data, error } = await supabase
          .from("tire_photos")
          .insert({
            survey_tire_id: positionId,
            category_id: categoryId,
            storage_path: storagePath,
            uploaded_by: profile.id,
          })
          .select("id")
          .single();

        if (error || !data) {
          throw new Error(
            `Metadata foto ban gagal disimpan: ${error?.message ?? "unknown error"}`
          );
        }

        insertedIds.push(data.id);
      }
    }
  } catch (error) {
    if (scope === "VEHICLE" && insertedIds.length) {
      await supabase.from("vehicle_photos").delete().in("id", insertedIds);
    }

    if (scope === "TIRE" && insertedIds.length) {
      await supabase.from("tire_photos").delete().in("id", insertedIds);
    }

    if (uploadedPaths.length) {
      await supabase.storage.from(BUCKET).remove(uploadedPaths);
    }

    return jsonError(
      error instanceof Error ? error.message : "Foto gagal diupload.",
      500
    );
  }

  return NextResponse.json({
    success: true,
    uploaded: insertedIds.length,
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { supabase, survey, error: surveyError } = await getSupplierDraft(id);

  if (surveyError || !survey) {
    return jsonError("Draft survey tidak ditemukan atau bukan milik Supplier ini.", 404);
  }

  let body: { photo_id?: string };
  try {
    body = (await request.json()) as { photo_id?: string };
  } catch {
    return jsonError("Payload delete foto tidak valid.");
  }

  const photoId = String(body.photo_id ?? "").trim();
  if (!photoId) {
    return jsonError("ID foto wajib diisi.");
  }

  const { data: vehiclePhoto, error: vehicleLookupError } = await supabase
    .from("vehicle_photos")
    .select("id, storage_path")
    .eq("id", photoId)
    .eq("survey_id", id)
    .maybeSingle();

  if (vehicleLookupError) {
    return jsonError(`Gagal mencari foto kendaraan: ${vehicleLookupError.message}`, 500);
  }

  if (vehiclePhoto) {
    const { data: deleted, error } = await supabase
      .from("vehicle_photos")
      .delete()
      .eq("id", photoId)
      .eq("survey_id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      return jsonError(`Foto kendaraan gagal dihapus: ${error.message}`, 500);
    }

    if (!deleted) {
      return jsonError(
        "Foto ditemukan tetapi tidak dapat dihapus. Periksa policy RLS vehicle_photos.",
        403
      );
    }

    const { error: storageError } = await supabase.storage
      .from(BUCKET)
      .remove([vehiclePhoto.storage_path]);

    if (storageError) {
      return jsonError(
        `Metadata foto sudah terhapus, tetapi file Storage gagal dihapus: ${storageError.message}`,
        500
      );
    }

    return NextResponse.json({ success: true });
  }

  const { data: tirePhoto, error: tireLookupError } = await supabase
    .from("tire_photos")
    .select("id, storage_path, survey_tire_id")
    .eq("id", photoId)
    .maybeSingle();

  if (tireLookupError) {
    return jsonError(`Gagal mencari foto ban: ${tireLookupError.message}`, 500);
  }

  if (!tirePhoto) {
    return jsonError("Foto tidak ditemukan.", 404);
  }

  const { data: tireOwner, error: tireOwnerError } = await supabase
    .from("survey_tires")
    .select("id")
    .eq("id", tirePhoto.survey_tire_id)
    .eq("survey_id", id)
    .maybeSingle();

  if (tireOwnerError) {
    return jsonError(`Gagal memeriksa pemilik posisi ban: ${tireOwnerError.message}`, 500);
  }

  if (!tireOwner) {
    return jsonError("Foto ban bukan bagian dari Draft ini.", 403);
  }

  const { data: deletedTire, error: tireDeleteError } = await supabase
    .from("tire_photos")
    .delete()
    .eq("id", photoId)
    .select("id")
    .maybeSingle();

  if (tireDeleteError) {
    return jsonError(`Foto ban gagal dihapus: ${tireDeleteError.message}`, 500);
  }

  if (!deletedTire) {
    return jsonError(
      "Foto ditemukan tetapi tidak dapat dihapus. Periksa policy RLS tire_photos.",
      403
    );
  }

  const { error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove([tirePhoto.storage_path]);

  if (storageError) {
    return jsonError(
      `Metadata foto sudah terhapus, tetapi file Storage gagal dihapus: ${storageError.message}`,
      500
    );
  }

  return NextResponse.json({ success: true });
}

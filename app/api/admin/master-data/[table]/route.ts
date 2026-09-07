import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MASTER_TABLE_KEYS, VEHICLE_CATEGORY_OPTIONS, type MasterTableKey } from "@/lib/admin-master-data";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isMasterTable(table: string): table is MasterTableKey {
  return (MASTER_TABLE_KEYS as string[]).includes(table);
}

function cleanText(value: unknown, label: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

/** Builds the insert payload for one master table, or null if the body is invalid for it. */
function buildInsertPayload(table: MasterTableKey, body: Record<string, unknown>): Record<string, unknown> | null {
  switch (table) {
    case "master_provinces":
    case "master_vehicle_brands":
    case "master_tire_brands": {
      const name = cleanText(body.name, "name");
      if (!name) return null;
      return { name };
    }
    case "master_cities": {
      const name = cleanText(body.name, "name");
      const provinceId = Number(body.province_id);
      if (!name || !Number.isFinite(provinceId)) return null;
      return { name, province_id: provinceId };
    }
    case "master_tire_sizes": {
      const size = cleanText(body.size, "size");
      const vehicleCategory = body.vehicle_category;
      if (!size || !VEHICLE_CATEGORY_OPTIONS.includes(vehicleCategory as never)) return null;
      const ringSize = cleanText(body.ring_size, "ring_size");
      return { size, vehicle_category: vehicleCategory, ring_size: ringSize };
    }
    case "master_tire_patterns": {
      const pattern = cleanText(body.pattern, "pattern");
      const vehicleCategory = body.vehicle_category;
      const tireBrandId = Number(body.tire_brand_id);
      if (!pattern || !VEHICLE_CATEGORY_OPTIONS.includes(vehicleCategory as never) || !Number.isFinite(tireBrandId)) {
        return null;
      }
      const application = cleanText(body.application, "application");
      return {
        pattern,
        vehicle_category: vehicleCategory,
        tire_brand_id: tireBrandId,
        application,
      };
    }
    default:
      return null;
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ table: string }> },
) {
  const { table } = await context.params;
  const { profile } = await requireRole(["superadmin"]);

  if (!isMasterTable(table)) {
    return errorResponse("Tabel master data tidak dikenali.", 404);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return errorResponse("Payload tidak valid.");
  }

  const payload = buildInsertPayload(table, body as Record<string, unknown>);
  if (!payload) {
    return errorResponse("Data yang dikirim tidak lengkap atau tidak valid.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from(table).insert(payload).select("*").single();

  if (error || !data) {
    return errorResponse(`Gagal menambah data: ${error?.message ?? "unknown"}`, 500);
  }

  const { error: logError } = await supabase.from("activity_logs").insert({
    survey_id: null,
    actor_id: profile.id,
    action: "ADMIN_MASTER_DATA_CREATE",
    old_value: null,
    new_value: { table, ...payload },
  });
  if (logError) {
    console.error("activity_logs insert failed for ADMIN_MASTER_DATA_CREATE", logError);
  }

  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ table: string }> },
) {
  const { table } = await context.params;
  const { profile } = await requireRole(["superadmin"]);

  if (!isMasterTable(table)) {
    return errorResponse("Tabel master data tidak dikenali.", 404);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return errorResponse("Payload tidak valid.");
  }

  const { id, is_active: isActive } = body as { id?: unknown; is_active?: unknown };
  if (typeof id !== "number" || typeof isActive !== "boolean") {
    return errorResponse("id dan is_active wajib diisi.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .update({ is_active: isActive })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    return errorResponse(`Gagal memperbarui data: ${error?.message ?? "unknown"}`, 500);
  }

  const { error: logError } = await supabase.from("activity_logs").insert({
    survey_id: null,
    actor_id: profile.id,
    action: "ADMIN_MASTER_DATA_TOGGLE",
    old_value: null,
    new_value: { table, id, is_active: isActive },
  });
  if (logError) {
    console.error("activity_logs insert failed for ADMIN_MASTER_DATA_TOGGLE", logError);
  }

  return NextResponse.json({ data });
}

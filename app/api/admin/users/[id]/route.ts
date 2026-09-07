import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const VALID_ROLES = ["supplier", "qc_backend", "pm_pic", "superadmin"];

// Activates/deactivates a user and/or changes their role. Account CREATION
// still goes through provision-users.mjs (it needs the Supabase Auth admin
// API to set an initial password, which this app deliberately doesn't hold
// a service-role key for) — this route only touches public.users, which
// users_update_superadmin already lets an authenticated superadmin do.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const { profile } = await requireRole(["superadmin"]);
  const supabase = await createClient();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return errorResponse("Payload tidak valid.");
  }

  const { role, isActive } = body as { role?: unknown; isActive?: unknown };
  const patch: Record<string, unknown> = {};

  if (role !== undefined) {
    if (typeof role !== "string" || !VALID_ROLES.includes(role)) {
      return errorResponse("Role tidak valid.");
    }
    patch.role = role;
  }

  if (isActive !== undefined) {
    if (typeof isActive !== "boolean") {
      return errorResponse("Status aktif tidak valid.");
    }
    patch.is_active = isActive;
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse("Tidak ada perubahan yang dikirim.");
  }

  if (id === profile.id && (patch.role !== undefined || patch.is_active === false)) {
    return errorResponse("Tidak bisa mengubah role atau menonaktifkan akun sendiri.", 403);
  }

  const { data: existing, error: existingError } = await supabase
    .from("users")
    .select("id, role, is_active")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return errorResponse("Pengguna tidak ditemukan.", 404);
  }

  const { data: updated, error: updateError } = await supabase
    .from("users")
    .update(patch)
    .eq("id", id)
    .select("id, user_code, full_name, role, is_active")
    .single();

  if (updateError || !updated) {
    return errorResponse(`Gagal memperbarui pengguna: ${updateError?.message ?? "unknown"}`, 500);
  }

  const { error: logError } = await supabase.from("activity_logs").insert({
    survey_id: null,
    actor_id: profile.id,
    action: "ADMIN_USER_UPDATE",
    old_value: { role: existing.role, is_active: existing.is_active },
    new_value: patch,
  });

  if (logError) {
    console.error("activity_logs insert failed for ADMIN_USER_UPDATE", logError);
  }

  return NextResponse.json({ data: updated });
}

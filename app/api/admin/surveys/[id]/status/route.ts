import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const VALID_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "QC_REVIEW",
  "QC_REVISION",
  "QC_PASSED",
  "QC_DROPPED",
  "BACKEND_REVIEW",
  "BACKEND_REVISION",
  "COMPLETED",
];

// Superadmin-only manual override: sets a survey's status directly instead
// of through the normal submit/QC/backend workflow. Bypasses no RLS itself
// (surveys_superadmin_update already lets an active superadmin update any
// survey row) — this route's job is to require a reason and record it.
export async function POST(
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

  const { status, reason } = body as { status?: unknown; reason?: unknown };
  if (typeof status !== "string" || !VALID_STATUSES.includes(status)) {
    return errorResponse("Status tujuan tidak valid.");
  }
  if (typeof reason !== "string" || !reason.trim()) {
    return errorResponse("Alasan koreksi wajib diisi.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("surveys")
    .select("id, status")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    return errorResponse("Survey tidak ditemukan.", 404);
  }

  const { error: updateError } = await supabase
    .from("surveys")
    .update({ status })
    .eq("id", id);

  if (updateError) {
    return errorResponse(`Gagal memperbarui status: ${updateError.message}`, 500);
  }

  const { error: logError } = await supabase.from("activity_logs").insert({
    survey_id: id,
    actor_id: profile.id,
    action: "ADMIN_STATUS_CORRECTION",
    old_value: { status: existing.status },
    new_value: { status, reason: reason.trim() },
  });

  if (logError) {
    // The status change already succeeded; a failed audit write shouldn't
    // be reported to the caller as a failed correction, but it does need
    // to be visible somewhere.
    console.error("activity_logs insert failed for ADMIN_STATUS_CORRECTION", logError);
  }

  return NextResponse.json({ ok: true, status });
}

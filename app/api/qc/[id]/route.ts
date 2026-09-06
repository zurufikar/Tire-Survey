import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { profile } = await requireRole(["qc_backend"]);
  const supabase = await createClient();

  const { data: assignment, error: assignmentError } = await supabase
    .from("qc_assignments")
    .select("id")
    .eq("survey_id", id)
    .eq("assigned_to", profile.id)
    .maybeSingle();

  if (assignmentError) {
    return errorResponse(`Gagal memeriksa assignment QC: ${assignmentError.message}`, 500);
  }

  if (!assignment) {
    return errorResponse("Survey ini bukan assignment QC untuk akun Anda.", 403);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return errorResponse("Payload QC tidak valid.");
  }

  const { decision, overallComment, vehicleComments, tireComments } = body as {
    decision?: unknown;
    overallComment?: unknown;
    vehicleComments?: unknown;
    tireComments?: unknown;
  };

  const normalizedDecision = typeof decision === "string" ? decision.toUpperCase() : "";
  if (!(["PASS", "REVISION", "DROP"] as string[]).includes(normalizedDecision)) {
    return errorResponse("Keputusan QC tidak valid.");
  }

  if (typeof overallComment !== "string") {
    return errorResponse("Catatan keseluruhan QC tidak valid.");
  }

  if (!Array.isArray(vehicleComments) || !Array.isArray(tireComments)) {
    return errorResponse("Data komentar QC tidak valid.");
  }

  const { error } = await supabase.rpc("submit_qc_review", {
    p_survey_id: id,
    p_decision: normalizedDecision,
    p_overall_comment: overallComment,
    p_vehicle_comments: vehicleComments,
    p_tire_comments: tireComments,
  });

  if (error) {
    const mapped = {
      NOT_ASSIGNED_TO_QC: ["Survey ini bukan assignment QC untuk akun Anda.", 403],
      SURVEY_NOT_IN_QC_STATE: ["Survey ini sudah tidak berada pada antrean QC.", 409],
      SURVEY_NOT_FOUND: ["Survey tidak ditemukan.", 404],
      FORBIDDEN: ["Akun tidak memiliki hak QC.", 403],
    } as const;

    const result = mapped[error.message as keyof typeof mapped];
    if (result) return errorResponse(result[0], result[1]);

    return errorResponse(`Gagal menyimpan hasil QC: ${error.message}`, 500);
  }

  return NextResponse.json({ ok: true, decision: normalizedDecision });
}

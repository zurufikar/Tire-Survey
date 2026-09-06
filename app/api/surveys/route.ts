import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const { profile } = await requireRole(["supplier"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("surveys")
    .insert({
      supplier_id: profile.id,
      status: "DRAFT",
      plate_number: "",
    })
    .select(
      "id, serial_number, survey_date, plate_number, status, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    return NextResponse.json(
      {
        error: error?.message ?? "Draft survey gagal dibuat.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ data }, { status: 201 });
}

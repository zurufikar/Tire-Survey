import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizePlate(value: string) {
  return value.toUpperCase().replace(/\s+/g, "");
}

export async function GET(
  request: Request,
  { params }: RouteContext
) {
  const { id } = await params;
  const url = new URL(request.url);
  const rawPlate = url.searchParams.get("plate") ?? "";
  const plate = normalizePlate(rawPlate);

  if (!plate) {
    return NextResponse.json(
      {
        available: false,
        message: "Nomor Polisi belum diisi.",
      },
      { status: 400 }
    );
  }

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

  const { data: survey, error: surveyError } = await supabase
    .from("surveys")
    .select("id")
    .eq("id", id)
    .eq("supplier_id", user.id)
    .in("status", ["DRAFT", "QC_REVISION"])
    .single();

  if (surveyError || !survey) {
    return NextResponse.json(
      { error: "Survey tidak ditemukan." },
      { status: 404 }
    );
  }

  const { data: available, error: checkError } =
    await supabase.rpc("is_plate_available", {
      p_plate: plate,
      p_survey_id: id,
    });

  if (checkError) {
    console.error(
      "Plate availability check failed:",
      checkError
    );

    return NextResponse.json(
      { error: "Gagal memeriksa nomor polisi." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    available: Boolean(available),
    normalized_plate: plate,
    message: available
      ? "Nomor Polisi tersedia."
      : "Nomor Polisi sudah terdaftar dan masih aktif di sistem.",
  });
}

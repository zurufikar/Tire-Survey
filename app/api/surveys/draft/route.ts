import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
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

  if (!profile.is_active) {
    return NextResponse.json(
      { error: "Account is not active." },
      { status: 403 }
    );
  }

  if (profile.role !== "supplier") {
    return NextResponse.json(
      { error: "Only Data Supplier can create a survey." },
      { status: 403 }
    );
  }

  const { data: survey, error: insertError } = await supabase
    .from("surveys")
    .insert({
      supplier_id: user.id,
      status: "DRAFT",
    })
    .select("id, status, survey_date, created_at")
    .single();

  if (insertError || !survey) {
    console.error("Create draft survey failed:", insertError);

    return NextResponse.json(
      { error: "Failed to create survey draft." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      data: survey,
    },
    {
      status: 201,
    }
  );
}
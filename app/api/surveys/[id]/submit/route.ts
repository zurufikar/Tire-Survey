import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { profile } = await requireRole(["supplier"]);
    const { id } = await context.params;
    const supabase = await createClient();

    // The database function performs the authoritative validation and locks
    // the DRAFT row before generating the official Serial Number.
    const { data, error } = await supabase.rpc("submit_supplier_survey", {
      p_survey_id: id,
    });

    if (error) {
      console.error("submit_supplier_survey RPC error", {
        surveyId: id,
        supplierId: profile.id,
        message: error.message,
      });
      return NextResponse.json(
        { error: "Survey gagal disubmit. Silakan coba lagi." },
        { status: 500 }
      );
    }

    const result = data as
      | {
          ok?: boolean;
          serial_number?: string;
          status?: string;
          errors?: string[];
          error?: string;
        }
      | null;

    if (!result?.ok) {
      return NextResponse.json(
        {
          error: result?.error,
          errors: result?.errors ?? ["Survey belum memenuhi syarat Submit."],
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      serial_number: result.serial_number,
      status: result.status,
    });
  } catch (error) {
    console.error("Unexpected submit survey error", error);
    return NextResponse.json(
      { error: "Survey gagal disubmit. Silakan coba lagi." },
      { status: 500 }
    );
  }
}

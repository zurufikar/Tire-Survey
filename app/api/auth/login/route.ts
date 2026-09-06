import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function normalizeUserCode(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userCode = normalizeUserCode(body?.userCode);
    const password = typeof body?.password === "string" ? body.password : "";
    const invalid = () => NextResponse.json({ error: "User Code atau password tidak benar." }, { status: 401 });

    if (!userCode || !password) return invalid();

    const supabase = await createClient();

    // Resolves user_code -> email via the `get_login_email` RPC (see
    // migration 020). That function is SECURITY DEFINER, so this lookup
    // works with only the publishable key — no service role key needed
    // at runtime, in dev or in production.
    const { data: rows, error: lookupError } = await supabase.rpc("get_login_email", {
      p_user_code: userCode,
    });
    const match = rows?.[0];

    if (lookupError || !match || !match.is_active || !match.email) return invalid();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: match.email,
      password,
    });
    if (signInError) return invalid();

    // Now that the request is authenticated, RLS lets us read the caller's
    // own profile directly (see users_select_own_or_superadmin policy).
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("user_code", userCode)
      .maybeSingle();

    return NextResponse.json({ ok: true, role: profile?.role ?? null });
  } catch (error) {
    console.error("POST /api/auth/login failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat login." }, { status: 500 });
  }
}

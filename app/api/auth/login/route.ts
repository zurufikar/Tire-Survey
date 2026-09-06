import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("id, role, is_active")
      .eq("user_code", userCode)
      .maybeSingle();

    if (profileError || !profile || !profile.is_active) return invalid();

    const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(profile.id);
    if (authLookupError || !authUser.user?.email) return invalid();

    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: authUser.user.email,
      password,
    });
    if (signInError) return invalid();

    return NextResponse.json({ ok: true, role: profile.role });
  } catch (error) {
    console.error("POST /api/auth/login failed", error);
    return NextResponse.json({ error: "Terjadi kesalahan saat login." }, { status: 500 });
  }
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole =
  | "supplier"
  | "qc_backend"
  | "pm_pic"
  | "superadmin";

export async function getCurrentUserProfile() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, user_code, full_name, role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return null;
  }

  return {
    authUser: user,
    profile,
  };
}

export async function requireActiveUser() {
  const result = await getCurrentUserProfile();

  if (!result) {
    redirect("/login");
  }

  if (!result.profile.is_active) {
    redirect("/account-pending");
  }

  return result;
}

export async function requireRole(allowedRoles: AppRole[]) {
  const result = await requireActiveUser();

  if (!allowedRoles.includes(result.profile.role as AppRole)) {
    redirect("/unauthorized");
  }

  return result;
}
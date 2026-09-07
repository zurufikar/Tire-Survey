import { redirect } from "next/navigation";
import { getCurrentUserProfile, type AppRole } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/role-home";

// "/" only ever routes the visitor somewhere else: to login when signed
// out, to the pending screen when disabled, or to their role's home.
// (Previously this file was a byte-for-byte duplicate of /login instead.)
export default async function RootPage() {
  const result = await getCurrentUserProfile();

  if (!result) {
    redirect("/login");
  }

  if (!result.profile.is_active) {
    redirect("/account-pending");
  }

  redirect(ROLE_HOME[result.profile.role as AppRole] ?? "/login");
}

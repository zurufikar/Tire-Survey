import Link from "next/link";
import { getCurrentUserProfile, type AppRole } from "@/lib/auth";
import { ROLE_HOME, ROLE_LABEL } from "@/lib/role-home";

/**
 * Global header shown on every page once a session exists (login stays
 * bare). Gives every screen the same persistent branding, the current
 * user's name/role, and — since nothing else in the app links to
 * /auth/signout — the only way to sign out.
 */
export async function AppShell() {
  const result = await getCurrentUserProfile();
  if (!result) return null;

  const { profile } = result;
  const role = profile.role as AppRole;
  const home = ROLE_HOME[role] ?? "/dashboard";

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link href={home} className="flex items-center gap-2 text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            TS
          </span>
          <span className="font-semibold">Tire Survey WebApp</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <p className="text-sm font-medium text-slate-900">
              {profile.full_name}
            </p>
            <p className="text-xs text-slate-500">
              {ROLE_LABEL[role] ?? profile.role}
              {profile.user_code ? ` • ${profile.user_code}` : ""}
              {!profile.is_active ? " • Nonaktif" : ""}
            </p>
          </div>
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Keluar
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

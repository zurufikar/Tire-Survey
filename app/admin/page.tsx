import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/role-home";

export default async function AdminOverviewPage() {
  const { profile } = await requireRole(["superadmin"]);
  const supabase = await createClient();

  const [usersResult, pendingResult, surveysResult] = await Promise.all([
    supabase.from("users").select("role, is_active"),
    supabase
      .from("users")
      .select("id, full_name, user_code, role, created_at")
      .eq("is_active", false)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("surveys").select("status"),
  ]);

  if (usersResult.error || pendingResult.error || surveysResult.error) {
    throw new Error("Data overview admin gagal dimuat.");
  }

  const users = usersResult.data ?? [];
  const roleCounts = new Map<string, number>();
  let activeCount = 0;
  for (const user of users) {
    roleCounts.set(user.role, (roleCounts.get(user.role) ?? 0) + 1);
    if (user.is_active) activeCount += 1;
  }

  const surveys = surveysResult.data ?? [];
  const statusCounts = new Map<string, number>();
  for (const survey of surveys) {
    statusCounts.set(survey.status, (statusCounts.get(survey.status) ?? 0) + 1);
  }

  const pending = pendingResult.data ?? [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-blue-600">Panel Superadmin</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Overview</h1>
          <p className="mt-1 text-sm text-slate-500">
            {profile.full_name}
            {profile.user_code ? ` • ${profile.user_code}` : ""}
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Total Pengguna</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{users.length}</p>
            <p className="mt-1 text-xs text-slate-500">{activeCount} aktif</p>
          </div>
          {(["supplier", "qc_backend", "pm_pic", "superadmin"] as const).map((role) => (
            <div key={role} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-500">{ROLE_LABEL[role]}</p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">
                {roleCounts.get(role) ?? 0}
              </p>
            </div>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold text-slate-900">Survey per Status</h2>
            <div className="mt-3 space-y-2">
              {surveys.length === 0 && (
                <p className="text-sm text-slate-500">Belum ada survey.</p>
              )}
              {[...statusCounts.entries()].map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{status}</span>
                  <span className="font-semibold text-slate-900">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Akun Menunggu Aktivasi</h2>
              <Link href="/admin/users" className="text-sm font-medium text-blue-600 hover:underline">
                Kelola Pengguna →
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {pending.length === 0 && (
                <p className="text-sm text-slate-500">Tidak ada akun yang menunggu aktivasi.</p>
              )}
              {pending.map((user) => (
                <div key={user.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">
                    {user.full_name}
                    {user.user_code ? ` (${user.user_code})` : ""}
                  </span>
                  <span className="text-xs text-slate-500">{ROLE_LABEL[user.role as keyof typeof ROLE_LABEL] ?? user.role}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

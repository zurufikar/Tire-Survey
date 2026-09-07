import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/role-home";
import { UserRowControls } from "@/components/admin/user-row-controls";

type AppRole = "supplier" | "qc_backend" | "pm_pic" | "superadmin";

export default async function AdminUsersPage() {
  const { profile } = await requireRole(["superadmin"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("users")
    .select("id, user_code, full_name, role, is_active, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Gagal memuat daftar pengguna: ${error.message}`);
  }

  const users = data ?? [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-blue-600">Superadmin</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Pengguna</h1>
          <p className="mt-1 text-sm text-slate-500">
            Aktivasi akun baru dan ubah role di sini. Pembuatan akun baru
            (User Code + password awal) masih dilakukan lewat script{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">scripts/provision-users.mjs</code>.
          </p>
        </header>

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">User Code</th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{user.user_code ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-700">{user.full_name}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {ROLE_LABEL[user.role as AppRole] ?? user.role}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          user.is_active
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                            : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                        }`}
                      >
                        {user.is_active ? "Aktif" : "Menunggu"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <UserRowControls
                        userId={user.id}
                        role={user.role as AppRole}
                        isActive={user.is_active}
                        isSelf={user.id === profile.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

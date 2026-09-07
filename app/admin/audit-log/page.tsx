import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function AdminAuditLogPage() {
  await requireRole(["superadmin"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("activity_logs")
    .select("id, survey_id, actor_id, action, old_value, new_value, created_at, users!activity_logs_actor_id_fkey(full_name, user_code)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Gagal memuat audit log: ${error.message}`);
  }

  const rows = data ?? [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-blue-600">Superadmin</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Audit Log</h1>
          <p className="mt-1 text-sm text-slate-500">
            200 aktivitas terbaru, termasuk perubahan pengguna, master data, dan koreksi status
            manual (survey_id kosong = aktivitas tingkat admin, bukan aksi terkait survey tertentu).
          </p>
        </header>

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Aktor</th>
                  <th className="px-4 py-3">Aksi</th>
                  <th className="px-4 py-3">Survey</th>
                  <th className="px-4 py-3">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      Belum ada aktivitas tercatat.
                    </td>
                  </tr>
                )}
                {rows.map((row) => {
                  const actor = Array.isArray(row.users) ? row.users[0] : row.users;
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {actor?.full_name ?? "-"}
                        {actor?.user_code ? ` (${actor.user_code})` : ""}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.action}</td>
                      <td className="px-4 py-3">
                        {row.survey_id ? (
                          <a
                            href={`/survey/${row.survey_id}/view`}
                            className="text-blue-600 hover:underline"
                          >
                            Lihat
                          </a>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="max-w-md px-4 py-3">
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-600">
                          {JSON.stringify({ old: row.old_value, new: row.new_value }, null, 0)}
                        </pre>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

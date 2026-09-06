import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ACTIVE_BACKEND_STATUSES = ["QC_PASSED", "BACKEND_REVIEW", "BACKEND_REVISION"] as const;
const TRACKED_BACKEND_STATUSES = [...ACTIVE_BACKEND_STATUSES, "COMPLETED"] as const;

function statusLabel(status: string) {
  switch (status) {
    case "QC_PASSED":
      return "Siap dikerjakan";
    case "BACKEND_REVIEW":
      return "Sedang dikerjakan";
    case "BACKEND_REVISION":
      return "Perlu revisi";
    case "COMPLETED":
      return "Selesai";
    default:
      return status;
  }
}

function statusClass(status: string) {
  switch (status) {
    case "QC_PASSED":
      return "bg-amber-50 text-amber-700";
    case "BACKEND_REVIEW":
      return "bg-blue-50 text-blue-700";
    case "BACKEND_REVISION":
      return "bg-orange-50 text-orange-700";
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export default async function BackendQueuePage() {
  const { profile } = await requireRole(["qc_backend"]);
  const supabase = await createClient();

  const { data: assignments, error: assignmentError } = await supabase
    .from("qc_assignments")
    .select("id, survey_id, assignment_order, assigned_at")
    .eq("assigned_to", profile.id)
    .order("assignment_order", { ascending: true });

  if (assignmentError) {
    throw new Error(`Gagal memuat queue Backend: ${assignmentError.message}`);
  }

  const surveyIds = (assignments ?? []).map((assignment) => assignment.survey_id);
  let surveys: any[] = [];

  if (surveyIds.length) {
    const result = await supabase
      .from("surveys")
      .select("id, serial_number, plate_number, status, company_name, supplier_id, created_at, updated_at")
      .in("id", surveyIds)
      .in("status", [...TRACKED_BACKEND_STATUSES]);

    if (result.error) {
      throw new Error(`Gagal memuat survey Backend: ${result.error.message}`);
    }

    surveys = result.data ?? [];
  }

  const byId = new Map(surveys.map((survey) => [survey.id, survey]));
  const items = (assignments ?? [])
    .map((assignment) => ({ assignment, survey: byId.get(assignment.survey_id) }))
    .filter((item): item is { assignment: (typeof assignments)[number]; survey: any } => Boolean(item.survey));

  const activeItems = items.filter(({ survey }) => (ACTIVE_BACKEND_STATUSES as readonly string[]).includes(survey.status));
  const completedItems = items.filter(({ survey }) => survey.status === "COMPLETED");
  const readyCount = activeItems.filter(({ survey }) => survey.status === "QC_PASSED").length;
  const inProgressCount = activeItems.filter(({ survey }) => survey.status === "BACKEND_REVIEW").length;
  const revisionCount = activeItems.filter(({ survey }) => survey.status === "BACKEND_REVISION").length;
  const completedCount = completedItems.length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-slate-500">Dashboard Backend</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">Pekerjaan QC + Backend</h1>
              <p className="mt-1 text-sm text-slate-500">Queue ini menampilkan survey yang menjadi tanggung jawab akun {profile.user_code ?? profile.full_name}.</p>
            </div>
            <div className="text-sm text-slate-500">Total riwayat: {items.length}</div>
          </div>
        </header>

        <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium text-slate-500">Siap dikerjakan</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{readyCount}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium text-slate-500">Sedang dikerjakan</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{inProgressCount}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium text-slate-500">Perlu revisi</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{revisionCount}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium text-slate-500">Selesai</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{completedCount}</p>
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Queue aktif</h2>
              <p className="text-sm text-slate-500">Prioritaskan survey yang sudah lolos QC dan belum selesai diproses.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{activeItems.length} survey</span>
          </div>

          {activeItems.length === 0 ? (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="font-semibold text-slate-900">Belum ada pekerjaan Backend</p>
              <p className="mt-1 text-sm text-slate-600">Survey akan muncul setelah QC PASS atau ketika ada revisi Backend.</p>
            </section>
          ) : (
            <div className="space-y-3">
              {activeItems.map(({ assignment, survey }) => (
                <a
                  key={assignment.id}
                  href={`/backend/${survey.id}`}
                  className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] text-slate-500">Assignment #{assignment.assignment_order}</p>
                      <p className="font-semibold text-slate-900">{survey.serial_number ?? "Tanpa Serial"}</p>
                      <p className="text-sm text-slate-600">{survey.plate_number || "-"} · {survey.company_name || "-"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(survey.status)}`}>
                        {statusLabel(survey.status)}
                      </span>
                      <span className="text-sm font-medium text-slate-500">Buka →</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Riwayat selesai</h2>
            <p className="text-sm text-slate-500">Survey yang sudah berstatus COMPLETED dan pernah menjadi assignment akun ini.</p>
          </div>

          {completedItems.length === 0 ? (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-500">Belum ada riwayat Backend yang selesai.</p>
            </section>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Serial Number</th>
                      <th className="px-4 py-3">Plat</th>
                      <th className="px-4 py-3">Perusahaan / Fleet</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {completedItems.map(({ assignment, survey }) => (
                      <tr key={assignment.id}>
                        <td className="px-4 py-3 font-medium text-slate-900">{survey.serial_number ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{survey.plate_number || "-"}</td>
                        <td className="px-4 py-3 text-slate-700">{survey.company_name || "-"}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(survey.status)}`}>{statusLabel(survey.status)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

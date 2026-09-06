import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QcQueueTable } from "@/components/qc/qc-queue-table";

type Assignment = {
  id: string;
  survey_id: string;
  assignment_order: number;
  assigned_at: string;
};

type Survey = {
  id: string;
  serial_number: string | null;
  plate_number: string;
  survey_date: string;
  supplier_id: string;
  status: string;
};

export default async function QcQueuePage() {
  const { profile } = await requireRole(["qc_backend"]);
  const supabase = await createClient();

  const { data: assignments, error: assignmentError } = await supabase
    .from("qc_assignments")
    .select("id, survey_id, assignment_order, assigned_at")
    .eq("assigned_to", profile.id)
    .order("assignment_order", { ascending: true });

  if (assignmentError) {
    throw new Error(`Gagal memuat assignment QC: ${assignmentError.message}`);
  }

  const typedAssignments = (assignments ?? []) as Assignment[];
  const surveyIds = typedAssignments.map((item) => item.survey_id);

  let surveys: Survey[] = [];
  if (surveyIds.length > 0) {
    const { data, error } = await supabase
      .from("surveys")
      .select("id, serial_number, plate_number, survey_date, supplier_id, status")
      .in("id", surveyIds);

    if (error) {
      throw new Error(`Gagal memuat survey QC: ${error.message}`);
    }

    surveys = (data ?? []) as Survey[];
  }

  const surveyMap = new Map(surveys.map((survey) => [survey.id, survey]));
  const queue = typedAssignments
    .map((assignment) => ({
      assignment,
      survey: surveyMap.get(assignment.survey_id),
    }))
    .filter((item): item is { assignment: Assignment; survey: Survey } => Boolean(item.survey));

  const pendingCount = queue.filter(({ survey }) => survey.status === "SUBMITTED" || survey.status === "QC_REVIEW").length;
  const passCount = queue.filter(({ survey }) => survey.status === "QC_PASSED").length;
  const dropCount = queue.filter(({ survey }) => survey.status === "QC_DROPPED").length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-slate-500">QC + Backend</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">QC Dashboard</h1>
              <p className="mt-1 text-sm text-slate-500">Daftar kerja QC otomatis berdasarkan assignment round-robin.</p>
            </div>
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{profile.full_name}</div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{queue.length}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pending</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{pendingCount}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pass</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{passCount}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Drop</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{dropCount}</p>
          </div>
        </section>

        <QcQueueTable queue={queue} />
      </div>
    </main>
  );
}

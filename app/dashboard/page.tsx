import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewSurveyButton } from "@/components/dashboard/new-survey-button";

type SurveyStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "QC_REVIEW"
  | "QC_REVISION"
  | "QC_PASSED"
  | "BACKEND_REVIEW"
  | "BACKEND_REVISION"
  | "COMPLETED"
  | "QC_DROPPED";

type SurveyRow = {
  id: string;
  serial_number: string | null;
  survey_date: string;
  plate_number: string | null;
  province_id: number | null;
  city_id: number | null;
  city_other: string | null;
  vehicle_category: "TB" | "LT" | null;
  segment: "BUS" | "TRUCK" | null;
  company_name: string | null;
  status: SurveyStatus;
  updated_at: string;
};

const STATUS_LABEL: Record<SurveyStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Terkirim",
  QC_REVIEW: "Review QC",
  QC_REVISION: "Revisi QC",
  QC_PASSED: "Lolos QC",
  BACKEND_REVIEW: "Review Backend",
  BACKEND_REVISION: "Revisi Backend",
  COMPLETED: "Selesai",
  QC_DROPPED: "Drop QC",
};

const STATUS_CLASS: Record<SurveyStatus, string> = {
  DRAFT: "bg-amber-50 text-amber-700 ring-amber-200",
  SUBMITTED: "bg-sky-50 text-sky-700 ring-sky-200",
  QC_REVIEW: "bg-violet-50 text-violet-700 ring-violet-200",
  QC_REVISION: "bg-orange-50 text-orange-700 ring-orange-200",
  QC_PASSED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  BACKEND_REVIEW: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  BACKEND_REVISION: "bg-orange-50 text-orange-700 ring-orange-200",
  COMPLETED: "bg-green-50 text-green-700 ring-green-200",
  QC_DROPPED: "bg-red-50 text-red-700 ring-red-200",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function locationLabel(
  survey: SurveyRow,
  provinceMap: Map<number, string>,
  cityMap: Map<number, string>,
) {
  const province = survey.province_id
    ? provinceMap.get(survey.province_id) ?? "-"
    : "-";
  const city =
    survey.city_other?.trim() ||
    (survey.city_id ? cityMap.get(survey.city_id) : null) ||
    "-";

  return `${province} / ${city}`;
}

function vehicleSummary(survey: SurveyRow) {
  const parts = [
    survey.plate_number?.trim() || null,
    survey.vehicle_category || null,
    survey.segment || null,
  ].filter(Boolean);

  return parts.join(" • ") || "Belum diisi";
}

export default async function DashboardPage() {
  const { profile } = await requireRole([
    "supplier",
    "qc_backend",
    "pm_pic",
    "superadmin",
  ]);

  if (profile.role === "qc_backend") {
    redirect("/qc");
  }

  if (profile.role === "pm_pic") {
    redirect("/reports");
  }

  if (profile.role === "superadmin") {
    redirect("/admin");
  }
  const supabase = await createClient();

  const [surveysResult, provincesResult, citiesResult] = await Promise.all([
    supabase
      .from("surveys")
      .select(
        "id, serial_number, survey_date, plate_number, province_id, city_id, city_other, vehicle_category, segment, company_name, status, updated_at",
      )
      .eq("supplier_id", profile.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("master_provinces")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("master_cities")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (surveysResult.error) {
    throw new Error(`Gagal memuat data survey: ${surveysResult.error.message}`);
  }
  if (provincesResult.error || citiesResult.error) {
    throw new Error("Master lokasi gagal dimuat.");
  }

  const surveys = (surveysResult.data ?? []) as SurveyRow[];
  const provinceMap = new Map(
    (provincesResult.data ?? []).map((row) => [row.id, row.name]),
  );
  const cityMap = new Map(
    (citiesResult.data ?? []).map((row) => [row.id, row.name]),
  );

  const draftCount = surveys.filter((survey) => survey.status === "DRAFT").length;
  const submittedCount = surveys.filter(
    (survey) => survey.status !== "DRAFT",
  ).length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600">
                Dashboard Supplier
              </p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">
                Survey Saya
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {profile.full_name}
                {profile.user_code ? ` • ${profile.user_code}` : ""}
              </p>
            </div>

            <NewSurveyButton />
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Total Survey</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">
              {surveys.length}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Draft Belum Selesai</p>
            <p className="mt-2 text-3xl font-semibold text-amber-600">
              {draftCount}
            </p>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">Sudah Submit</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-600">
              {submittedCount}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Riwayat Survey</h2>
            <p className="mt-1 text-sm text-slate-500">
              Hanya survey yang dibuat oleh akun Supplier ini.
            </p>
          </div>

          {surveys.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="font-medium text-slate-900">
                Belum ada survey.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Buat draft pertama untuk mulai mengisi data kendaraan.
              </p>
              <div className="mt-4">
                <NewSurveyButton />
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Serial Number</th>
                    <th className="px-5 py-3">Tanggal</th>
                    <th className="px-5 py-3">Kendaraan</th>
                    <th className="px-5 py-3">Provinsi / Kota</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {surveys.map((survey) => {
                    const status = survey.status;
                    const actionHref =
                      status === "DRAFT" || status === "QC_REVISION"
                        ? `/survey/${survey.id}/edit`
                        : `/survey/${survey.id}/view`;
                    const actionLabel =
                      status === "DRAFT"
                        ? "Lanjutkan"
                        : status === "QC_REVISION"
                          ? "Perbaiki"
                          : "Lihat";

                    return (
                      <tr key={survey.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">
                            {survey.serial_number ?? "-"}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            UUID draft: {survey.id}
                          </p>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-slate-700">
                          {formatDate(survey.survey_date)}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">
                            {vehicleSummary(survey)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {survey.company_name?.trim() || "Perusahaan belum diisi"}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-slate-700">
                          {locationLabel(survey, provinceMap, cityMap)}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_CLASS[status]}`}
                          >
                            {STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={actionHref}
                            className="inline-flex rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            {actionLabel}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

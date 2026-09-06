import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BasicSurveyForm } from "@/components/survey/basic-survey-form";

type EditSurveyPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditSurveyPage({
  params,
}: EditSurveyPageProps) {
  const { profile } = await requireRole(["supplier"]);
  const { id } = await params;
  const supabase = await createClient();

  const [
    surveyResult,
    provincesResult,
    citiesResult,
    vehicleBrandsResult,
    axleConfigsResult,
    qcReviewsResult,
    vehicleCommentsResult,
    tireCommentsResult,
    photoCategoriesResult,
  ] = await Promise.all([
    supabase
      .from("surveys")
      .select(
        "id, serial_number, survey_date, plate_number, province_id, city_id, city_other, vehicle_category, segment, bus_category, truck_category, specific_vehicle_type, company_name, vehicle_brand_id, vehicle_brand_other, cargo_type, total_axles, total_tires, status"
      )
      .eq("id", id)
      .eq("supplier_id", profile.id)
      .single(),

    supabase
      .from("master_provinces")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),

    supabase
      .from("master_cities")
      .select("id, name, province_id")
      .eq("is_active", true)
      .order("name"),

    supabase
      .from("master_vehicle_brands")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),

    supabase
      .from("survey_axle_configs")
      .select("axle_type, axle_count, tire_configuration, tire_count, axle_order")
      .eq("survey_id", id)
      .order("axle_order"),

    supabase
      .from("qc_reviews")
      .select("id, decision, overall_comment, reviewed_at, created_at")
      .eq("survey_id", id)
      .order("created_at", { ascending: false }),

    supabase
      .from("vehicle_photos")
      .select("id, category_id, qc_comment")
      .eq("survey_id", id)
      .not("qc_comment", "is", null)
      .order("created_at", { ascending: true }),

    supabase
      .from("survey_tires")
      .select("id, position_name, qc_comment, tire_sequence")
      .eq("survey_id", id)
      .not("qc_comment", "is", null)
      .order("tire_sequence", { ascending: true }),

    supabase
      .from("tire_photo_categories")
      .select("id, name")
      .order("sort_order"),
  ]);

  if (
    surveyResult.error ||
    !surveyResult.data
  ) {
    notFound();
  }

  if (
    provincesResult.error ||
    citiesResult.error ||
    vehicleBrandsResult.error ||
    axleConfigsResult.error ||
    qcReviewsResult.error ||
    vehicleCommentsResult.error ||
    tireCommentsResult.error ||
    photoCategoriesResult.error
  ) {
    throw new Error(
      "Master data gagal dimuat."
    );
  }

  const survey = surveyResult.data;
  const photoCategoryMap = new Map(
    (photoCategoriesResult.data ?? []).map((item) => [item.id, item.name])
  );

  if (survey.status !== "DRAFT" && survey.status !== "QC_REVISION") {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-blue-600">
            {survey.status === "QC_REVISION" ? "Revisi QC" : "Draft Survey"}
          </p>

          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Survey Kendaraan
              </h1>

              <p className="mt-1 break-all text-sm text-slate-500">
                {survey.status === "QC_REVISION"
                  ? `Serial Number: ${survey.serial_number ?? "-"}`
                  : `Draft ID: ${survey.id}`}
              </p>
            </div>

            <div className={`rounded-lg px-3 py-2 text-sm ${survey.status === "QC_REVISION" ? "bg-orange-50 text-orange-800" : "bg-amber-50 text-amber-800"}`}>
              {survey.status === "QC_REVISION"
                ? "Perbaiki data/evidence sesuai komentar QC lalu kirim ulang."
                : "Serial Number dibuat saat Submit"}
            </div>
          </div>
        </header>

        {survey.status === "QC_REVISION" && (
          <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-amber-200">
            <div>
              <p className="text-sm font-semibold text-amber-800">Feedback QC</p>
              <p className="mt-1 text-sm text-slate-500">Perbaiki bagian yang disebutkan di bawah sebelum mengirim ulang survey.</p>
            </div>

            {qcReviewsResult.data?.[0] && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-amber-900">Keputusan: REVISION</p>
                  {qcReviewsResult.data[0].reviewed_at && (
                    <span className="text-xs text-amber-800">
                      {new Date(qcReviewsResult.data[0].reviewed_at).toLocaleString("id-ID")}
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Catatan keseluruhan QC</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-amber-950">
                    {qcReviewsResult.data[0].overall_comment?.trim() || "Tidak ada catatan keseluruhan."}
                  </p>
                </div>
              </div>
            )}

            {(vehicleCommentsResult.data?.length ?? 0) > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-900">Komentar pada Foto Kendaraan</p>
                <div className="mt-2 space-y-2">
                  {vehicleCommentsResult.data.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-600">
                        {photoCategoryMap.get(item.category_id) ?? "Foto kendaraan"}
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-wrap text-slate-800">{item.qc_comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(tireCommentsResult.data?.length ?? 0) > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-900">Komentar pada Posisi Ban</p>
                <div className="mt-2 space-y-2">
                  {tireCommentsResult.data.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold text-slate-600">{item.position_name}</p>
                      <p className="mt-1 text-sm whitespace-pre-wrap text-slate-800">{item.qc_comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <BasicSurveyForm
          survey={survey}
          supplierName={profile.full_name}
          supplierCode={profile.user_code}
          provinces={provincesResult.data ?? []}
          cities={citiesResult.data ?? []}
          vehicleBrands={
            vehicleBrandsResult.data ?? []
          }
          axleConfigs={(axleConfigsResult.data ?? []).map((config) => ({
            axle_type: config.axle_type,
            axle_count: config.axle_count,
            tire_configuration: config.tire_configuration,
          }))}
        />
      </div>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SupplierSurveyReview } from "@/components/survey/supplier-survey-review";

type ViewSurveyPageProps = { params: Promise<{ id: string }> };

const STATUS_LABEL: Record<string, string> = {
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

function categoryLabel(value: string | null) {
  if (value === "TB") return "Truck/Bus";
  if (value === "LT") return "Light Truck";
  return value || "-";
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

async function createSignedUrlMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
) {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) return new Map<string, string>();
  const { data, error } = await supabase.storage.from("survey-photos").createSignedUrls(uniquePaths, 60 * 60);
  if (error || !data) return new Map<string, string>();
  return new Map(data.flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
}

export default async function SupplierSurveyViewPage({ params }: ViewSurveyPageProps) {
  const { profile } = await requireRole(["supplier"]);
  const { id } = await params;
  const supabase = await createClient();

  const [surveyResult, provinceResult, cityResult, brandResult, categoriesResult, vehiclePhotosResult, tiresResult, tirePhotosResult, reviewsResult] = await Promise.all([
    supabase.from("surveys").select("id, serial_number, survey_date, plate_number, province_id, city_id, city_other, vehicle_category, segment, bus_category, truck_category, specific_vehicle_type, company_name, vehicle_brand_id, vehicle_brand_other, cargo_type, total_axles, total_tires, status, submitted_at, completed_at, updated_at").eq("id", id).eq("supplier_id", profile.id).single(),
    supabase.from("master_provinces").select("id, name").eq("is_active", true),
    supabase.from("master_cities").select("id, name").eq("is_active", true),
    supabase.from("master_vehicle_brands").select("id, name").eq("is_active", true),
    supabase.from("tire_photo_categories").select("id, code, name, scope").order("sort_order"),
    supabase.from("vehicle_photos").select("id, category_id, storage_path, created_at, qc_comment").eq("survey_id", id).order("created_at"),
    supabase.from("survey_tires").select("id, position_name, position_code, side, supplier_is_retread, tire_sequence, qc_comment").eq("survey_id", id).order("tire_sequence"),
    supabase.from("tire_photos").select("id, survey_tire_id, category_id, storage_path, created_at").order("created_at"),
    supabase.from("qc_reviews").select("id, decision, overall_comment, reviewed_at, created_at").eq("survey_id", id).order("created_at", { ascending: false }),
  ]);

  if (surveyResult.error || !surveyResult.data) notFound();
  if ([provinceResult, cityResult, brandResult, categoriesResult, vehiclePhotosResult, tiresResult, tirePhotosResult, reviewsResult].some((r) => r.error)) {
    throw new Error("Detail survey gagal dimuat.");
  }

  const survey = surveyResult.data;
  if (survey.status === "DRAFT") notFound();

  const provinceMap = new Map((provinceResult.data ?? []).map((row) => [row.id, row.name]));
  const cityMap = new Map((cityResult.data ?? []).map((row) => [row.id, row.name]));
  const brandMap = new Map((brandResult.data ?? []).map((row) => [row.id, row.name]));
  const categoryMap = new Map((categoriesResult.data ?? []).map((row) => [row.id, row]));
  const tirePhotoMap = new Map<string, Array<{ id: string; categoryName: string; signedUrl: string | null }>>();

  const allPaths = [
    ...(vehiclePhotosResult.data ?? []).map((photo) => photo.storage_path),
    ...(tirePhotosResult.data ?? []).map((photo) => photo.storage_path),
  ];
  const signedUrls = await createSignedUrlMap(supabase, allPaths);

  const vehiclePhotos = (vehiclePhotosResult.data ?? []).map((photo) => ({
    id: photo.id,
    categoryName: categoryMap.get(photo.category_id)?.name ?? "Foto Kendaraan",
    signedUrl: signedUrls.get(photo.storage_path) ?? null,
    qcComment: photo.qc_comment ?? "",
  }));

  for (const photo of tirePhotosResult.data ?? []) {
    const list = tirePhotoMap.get(photo.survey_tire_id) ?? [];
    list.push({
      id: photo.id,
      categoryName: categoryMap.get(photo.category_id)?.name ?? "Foto Ban",
      signedUrl: signedUrls.get(photo.storage_path) ?? null,
    });
    tirePhotoMap.set(photo.survey_tire_id, list);
  }

  const tires = (tiresResult.data ?? []).map((tire) => ({
    id: tire.id,
    positionName: tire.position_name,
    side: tire.side as "LEFT" | "RIGHT",
    supplierIsRetread: tire.supplier_is_retread,
    qcComment: tire.qc_comment ?? "",
    photos: tirePhotoMap.get(tire.id) ?? [],
  }));

  const province = survey.province_id ? provinceMap.get(survey.province_id) ?? "-" : "-";
  const city = survey.city_other?.trim() || (survey.city_id ? cityMap.get(survey.city_id) : null) || "-";
  const brand = survey.vehicle_brand_other?.trim() || (survey.vehicle_brand_id ? brandMap.get(survey.vehicle_brand_id) : null) || "-";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-600">Detail Survey Supplier</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">{survey.serial_number ?? "Survey"}</h1>
              <p className="mt-1 text-sm text-slate-500">Status: {STATUS_LABEL[survey.status] ?? survey.status}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {survey.status === "QC_REVISION" && (
                <Link href={`/survey/${survey.id}/edit`} className="inline-flex rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700">
                  Perbaiki Survey
                </Link>
              )}
              <Link href="/dashboard" className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Kembali ke Dashboard</Link>
            </div>
          </div>
        </header>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4"><h2 className="font-semibold text-slate-900">Identitas Survey</h2><p className="mt-1 text-sm text-slate-500">Data di halaman ini read-only.</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <InfoRow label="Serial Number" value={survey.serial_number ?? "-"} />
            <InfoRow label="Tanggal Survey" value={survey.survey_date} />
            <InfoRow label="Nomor Polisi" value={survey.plate_number || "-"} />
            <InfoRow label="Kategori Kendaraan" value={categoryLabel(survey.vehicle_category)} />
            <InfoRow label="Segmen" value={survey.segment || "-"} />
            <InfoRow label="Provinsi" value={province} />
            <InfoRow label="Kota" value={city} />
            <InfoRow label="Perusahaan / Fleet" value={survey.company_name || "-"} />
            <InfoRow label="Merk Kendaraan" value={brand} />
            <InfoRow label="Jenis Kendaraan Spesifik" value={survey.specific_vehicle_type || "-"} />
            <InfoRow label="Cargo Type" value={survey.cargo_type || "-"} />
            <InfoRow label="Total Poros" value={survey.total_axles == null ? "-" : String(survey.total_axles)} />
            <InfoRow label="Total Ban" value={survey.total_tires == null ? "-" : String(survey.total_tires)} />
            <InfoRow label="Submitted At" value={survey.submitted_at ?? "-"} />
            <InfoRow label="Completed At" value={survey.completed_at ?? "-"} />
            <InfoRow label="Last Updated" value={survey.updated_at} />
          </div>
        </section>

        <SupplierSurveyReview
          vehiclePhotos={vehiclePhotos}
          leftTires={tires.filter((tire) => tire.side === "LEFT")}
          rightTires={tires.filter((tire) => tire.side === "RIGHT")}
          reviews={(reviewsResult.data ?? []).map((review) => ({
            id: review.id,
            decision: review.decision,
            overallComment: review.overall_comment,
            reviewedAt: review.reviewed_at,
          }))}
        />
      </div>
    </main>
  );
}

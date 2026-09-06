import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { QcReviewWorkspace } from "@/components/qc/qc-review-workspace";

const BUCKET = "survey-photos";

async function createSignedUrlMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePaths: string[]
) {
  const uniquePaths = [...new Set(storagePaths)];
  if (uniquePaths.length === 0) return new Map<string, string>();

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(uniquePaths, 60 * 60);

  const result = new Map<string, string>();
  if (error || !data) return result;

  for (const item of data) {
    if (item.path && item.signedUrl) {
      result.set(item.path, item.signedUrl);
    }
  }

  return result;
}

export default async function QcReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireRole(["qc_backend"]);
  const supabase = await createClient();

  const { data: assignment, error: assignmentError } = await supabase
    .from("qc_assignments")
    .select("id, assignment_order, assigned_at")
    .eq("survey_id", id)
    .eq("assigned_to", profile.id)
    .maybeSingle();

  if (assignmentError) {
    throw new Error(`Gagal memuat assignment QC: ${assignmentError.message}`);
  }

  if (!assignment) notFound();

  const { data: queueAssignments, error: queueError } = await supabase
    .from("qc_assignments")
    .select("id, survey_id, assignment_order")
    .eq("assigned_to", profile.id)
    .order("assignment_order", { ascending: true });

  if (queueError) {
    throw new Error(`Gagal memuat queue QC: ${queueError.message}`);
  }

  const queueSurveyIds = (queueAssignments ?? []).map((item) => item.survey_id);
  let queueSurveys: Array<{ id: string; serial_number: string | null; plate_number: string; status: string }> = [];

  if (queueSurveyIds.length > 0) {
    const { data, error } = await supabase
      .from("surveys")
      .select("id, serial_number, plate_number, status")
      .in("id", queueSurveyIds);

    if (error) {
      throw new Error(`Gagal memuat ringkasan queue QC: ${error.message}`);
    }

    queueSurveys = data ?? [];
  }

  const queueSurveyMap = new Map(queueSurveys.map((item) => [item.id, item]));
  const queue = (queueAssignments ?? [])
    .map((item) => ({
      id: item.id,
      surveyId: item.survey_id,
      assignmentOrder: item.assignment_order,
      serialNumber: queueSurveyMap.get(item.survey_id)?.serial_number ?? null,
      plateNumber: queueSurveyMap.get(item.survey_id)?.plate_number ?? "",
      status: queueSurveyMap.get(item.survey_id)?.status ?? "",
    }));

  const { data: survey, error: surveyError } = await supabase
    .from("surveys")
    .select(
      "id, serial_number, survey_date, plate_number, province_id, city_id, vehicle_category, segment, bus_category, truck_category, specific_vehicle_type, company_name, vehicle_brand_id, cargo_type, total_axles, total_tires, status, supplier_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (surveyError) {
    throw new Error(`Gagal memuat survey QC: ${surveyError.message}`);
  }

  if (!survey) notFound();

  const [supplierResult, provinceResult, cityResult, vehicleBrandResult, vehiclePhotosResult, tiresResult, categoriesResult, latestReviewResult] =
    await Promise.all([
      supabase.from("users").select("id, full_name, user_code").eq("id", survey.supplier_id).maybeSingle(),
      survey.province_id
        ? supabase.from("master_provinces").select("id, name").eq("id", survey.province_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      survey.city_id
        ? supabase.from("master_cities").select("id, name").eq("id", survey.city_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      survey.vehicle_brand_id
        ? supabase.from("master_vehicle_brands").select("id, name").eq("id", survey.vehicle_brand_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("vehicle_photos")
        .select("id, category_id, storage_path, qc_comment, created_at")
        .eq("survey_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("survey_tires")
        .select("id, position_code, position_name, side, tire_layer, axle_type, axle_number, tire_sequence, supplier_is_retread, qc_comment")
        .eq("survey_id", id)
        .order("tire_sequence", { ascending: true }),
      supabase
        .from("tire_photo_categories")
        .select("id, code, name, scope")
        .order("sort_order", { ascending: true }),
      supabase
        .from("qc_reviews")
        .select("id, decision, overall_comment, reviewed_at, created_at")
        .eq("survey_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  for (const result of [
    supplierResult,
    provinceResult,
    cityResult,
    vehicleBrandResult,
    vehiclePhotosResult,
    tiresResult,
    categoriesResult,
    latestReviewResult,
  ]) {
    if (result.error) {
      throw new Error(`Gagal memuat data QC: ${result.error.message}`);
    }
  }

  const categoryMap = new Map((categoriesResult.data ?? []).map((c) => [c.id, c]));

  const allStoragePaths = [
    ...(vehiclePhotosResult.data ?? []).map((photo) => photo.storage_path),
  ];

  const tireIds = (tiresResult.data ?? []).map((tire) => tire.id);

  const { data: allTirePhotosRows, error: allTirePhotosError } = tireIds.length > 0
    ? await supabase
        .from("tire_photos")
        .select("id, survey_tire_id, category_id, storage_path, created_at")
        .in("survey_tire_id", tireIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (allTirePhotosError) {
    throw new Error(`Gagal memuat foto ban QC: ${allTirePhotosError.message}`);
  }

  const tirePhotosRows = allTirePhotosRows ?? [];
  allStoragePaths.push(...tirePhotosRows.map((photo) => photo.storage_path));

  // Generate all signed URLs in one Storage request instead of one request per image.
  const signedUrls = await createSignedUrlMap(supabase, allStoragePaths);

  const vehiclePhotos = (vehiclePhotosResult.data ?? []).map((photo) => {
    const category = categoryMap.get(photo.category_id);
    return {
      id: photo.id,
      categoryId: photo.category_id,
      categoryCode: category?.code ?? "",
      categoryName: category?.name ?? "Foto Kendaraan",
      signedUrl: signedUrls.get(photo.storage_path) ?? null,
      qcComment: photo.qc_comment ?? "",
      createdAt: photo.created_at,
    };
  });

  const tirePhotos = tirePhotosRows.map((photo) => {
    const category = categoryMap.get(photo.category_id);
    return {
      id: photo.id,
      tirePositionId: photo.survey_tire_id,
      categoryId: photo.category_id,
      categoryCode: category?.code ?? "",
      categoryName: category?.name ?? "Foto Ban",
      signedUrl: signedUrls.get(photo.storage_path) ?? null,
      createdAt: photo.created_at,
    };
  });

  const tirePhotoMap = new Map<string, typeof tirePhotos>();
  for (const photo of tirePhotos) {
    const current = tirePhotoMap.get(photo.tirePositionId) ?? [];
    current.push(photo);
    tirePhotoMap.set(photo.tirePositionId, current);
  }

  const tires = (tiresResult.data ?? []).map((tire) => ({
    ...tire,
    qcComment: tire.qc_comment ?? "",
    photos: tirePhotoMap.get(tire.id) ?? [],
  }));

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 md:px-5 lg:px-6">
      <div className="mx-auto max-w-[1500px] space-y-4">
        <header className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <Link href="/qc" className="hover:text-blue-700">QC Queue</Link>
                <span>/</span>
                <span>Review</span>
              </div>
              <h1 className="mt-1 text-xl font-semibold text-slate-900">
                Review QC · {survey.serial_number ?? "Tanpa Serial"}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Assignment #{assignment.assignment_order} · QC: {profile.full_name}
              </p>
            </div>
            <Link
              href="/qc"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Kembali ke Queue
            </Link>
          </div>
        </header>

        <QcReviewWorkspace
          survey={{
            id: survey.id,
            serialNumber: survey.serial_number,
            surveyDate: survey.survey_date,
            plateNumber: survey.plate_number,
            provinceName: provinceResult.data?.name ?? "-",
            cityName: cityResult.data?.name ?? "-",
            vehicleCategory: survey.vehicle_category,
            segment: survey.segment,
            busCategory: survey.bus_category,
            truckCategory: survey.truck_category,
            specificVehicleType: survey.specific_vehicle_type,
            companyName: survey.company_name,
            vehicleBrandName: vehicleBrandResult.data?.name ?? "-",
            cargoType: survey.cargo_type,
            totalAxles: survey.total_axles,
            totalTires: survey.total_tires,
            status: survey.status,
            supplierName: supplierResult.data?.full_name ?? "-",
            supplierCode: supplierResult.data?.user_code ?? "-",
          }}
          vehiclePhotos={vehiclePhotos}
          tires={tires}
          latestReview={latestReviewResult.data ?? null}
          queue={queue}
        />
      </div>
    </main>
  );
}

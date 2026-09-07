import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BackendReviewWorkspace } from "@/components/backend/backend-review-workspace";

type Props = { params: Promise<{ id: string }> };

export default async function BackendReviewPage({ params }: Props) {
  const { id } = await params;
  await requireRole(["qc_backend"]);
  const supabase = await createClient();
  const assignment = await supabase.from("qc_assignments").select("id").eq("survey_id", id).maybeSingle();
  if (assignment.error || !assignment.data) notFound();

  const [surveyResult, tireResult, provincesResult, citiesResult, vehicleBrandsResult, tireBrandsResult, tireSizesResult, tirePatternsResult] = await Promise.all([
    supabase.from("surveys").select("id, serial_number, plate_number, province_id, city_id, city_other, vehicle_category, segment, bus_category, truck_category, specific_vehicle_type, company_name, vehicle_brand_id, vehicle_brand_other, cargo_type, status, supplier_id, users!surveys_supplier_id_fkey(full_name,user_code)").eq("id", id).single(),
    supabase.from("survey_tires").select("id, position_name, position_code, side, axle_type, axle_number, tire_layer, supplier_is_retread, backend_brand_id, backend_size_id, backend_pattern_id, backend_ply_rating, backend_status, tire_sequence").eq("survey_id", id).order("tire_sequence"),
    supabase.from("master_provinces").select("id,name").eq("is_active", true).order("name"),
    supabase.from("master_cities").select("id,name,province_id").eq("is_active", true).order("name"),
    supabase.from("master_vehicle_brands").select("id,name").eq("is_active", true).order("name"),
    supabase.from("master_tire_brands").select("id,name").eq("is_active", true).order("name"),
    supabase.from("master_tire_sizes").select("id,size,vehicle_category").eq("is_active", true).order("size"),
    supabase.from("master_tire_patterns").select("id,pattern,application,tire_brand_id,vehicle_category").eq("is_active", true).order("pattern"),
  ]);
  if (surveyResult.error || !surveyResult.data || tireResult.error || provincesResult.error || citiesResult.error || vehicleBrandsResult.error || tireBrandsResult.error || tireSizesResult.error || tirePatternsResult.error) notFound();
  if (!["QC_PASSED", "BACKEND_REVIEW", "BACKEND_REVISION"].includes(surveyResult.data.status)) notFound();

  const tireIds = (tireResult.data ?? []).map((t) => t.id);
  const photosResult = tireIds.length
    ? await supabase.from("tire_photos").select("id,survey_tire_id,category_id,storage_path").in("survey_tire_id", tireIds).order("created_at")
    : { data: [], error: null };
  const catsResult = await supabase.from("tire_photo_categories").select("id,name");
  if (photosResult.error || catsResult.error) throw new Error("Foto ban gagal dimuat.");
  const categoryMap = new Map((catsResult.data ?? []).map((c) => [c.id, c.name]));
  const tires = await Promise.all((tireResult.data ?? []).map(async (t) => {
    const photos = await Promise.all((photosResult.data ?? []).filter((p) => p.survey_tire_id === t.id).map(async (p) => ({ id: p.id, categoryName: categoryMap.get(p.category_id) ?? "Foto", signedUrl: (await supabase.storage.from("survey-photos").createSignedUrl(p.storage_path, 3600)).data?.signedUrl ?? null })));
    return { ...t, photos };
  }));
  const supplier = Array.isArray(surveyResult.data.users) ? surveyResult.data.users[0] : surveyResult.data.users;

  const surveyData = surveyResult.data;
  const backendSurvey = {
    id: surveyData.id,
    serialNumber: surveyData.serial_number ?? null,
    plateNumber: surveyData.plate_number ?? "",
    provinceId: surveyData.province_id ?? null,
    cityId: surveyData.city_id ?? null,
    cityOther: surveyData.city_other ?? null,
    vehicleCategory: surveyData.vehicle_category ?? null,
    segment: surveyData.segment ?? null,
    busCategory: surveyData.bus_category ?? null,
    truckCategory: surveyData.truck_category ?? null,
    specificVehicleType: surveyData.specific_vehicle_type ?? null,
    companyName: surveyData.company_name ?? null,
    vehicleBrandId: surveyData.vehicle_brand_id ?? null,
    vehicleBrandOther: surveyData.vehicle_brand_other ?? null,
    cargoType: surveyData.cargo_type ?? null,
    supplierName: supplier?.full_name ?? "-",
    supplierCode: supplier?.user_code ?? null,
    status: surveyData.status,
  };

  return <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-6"><div className="mx-auto max-w-7xl"><BackendReviewWorkspace survey={backendSurvey} provinces={provincesResult.data ?? []} cities={citiesResult.data ?? []} vehicleBrands={vehicleBrandsResult.data ?? []} tireBrands={tireBrandsResult.data ?? []} tireSizes={tireSizesResult.data ?? []} tirePatterns={tirePatternsResult.data ?? []} tires={tires} /></div></main>;
}

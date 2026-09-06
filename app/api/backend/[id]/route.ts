import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function err(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { profile } = await requireRole(["qc_backend"]);
  const supabase = await createClient();

  const assignment = await supabase.from("qc_assignments").select("id").eq("survey_id", id).eq("assigned_to", profile.id).maybeSingle();
  if (assignment.error) return err(assignment.error.message, 500);
  if (!assignment.data) return err("Survey tidak ditugaskan ke akun Backend ini.", 403);

  const [surveyResult, tireResult, provincesResult, citiesResult, vehicleBrandsResult, tireBrandsResult, tireSizesResult, tirePatternsResult, photoCategoriesResult, vehiclePhotosResult] = await Promise.all([
    supabase.from("surveys").select("id, serial_number, plate_number, province_id, city_id, city_other, vehicle_category, segment, bus_category, truck_category, specific_vehicle_type, company_name, vehicle_brand_id, vehicle_brand_other, cargo_type, status, supplier_id, users!surveys_supplier_id_fkey(full_name,user_code)").eq("id", id).single(),
    supabase.from("survey_tires").select("id, position_name, position_code, side, axle_type, axle_number, tire_layer, supplier_is_retread, backend_brand_id, backend_size_id, backend_pattern_id, backend_ply_rating, backend_status").eq("survey_id", id).order("tire_sequence"),
    supabase.from("master_provinces").select("id,name").eq("is_active", true).order("name"),
    supabase.from("master_cities").select("id,name,province_id").eq("is_active", true).order("name"),
    supabase.from("master_vehicle_brands").select("id,name").eq("is_active", true).order("name"),
    supabase.from("master_tire_brands").select("id,name").eq("is_active", true).order("name"),
    supabase.from("master_tire_sizes").select("id,size,vehicle_category").eq("is_active", true).order("size"),
    supabase.from("master_tire_patterns").select("id,pattern,application,tire_brand_id,vehicle_category").eq("is_active", true).order("pattern"),
    supabase.from("tire_photo_categories").select("id,code,name").order("sort_order"),
    supabase.from("vehicle_photos").select("id,category_id,storage_path,created_at").eq("survey_id", id).order("created_at"),
  ]);
  for (const r of [surveyResult,tireResult,provincesResult,citiesResult,vehicleBrandsResult,tireBrandsResult,tireSizesResult,tirePatternsResult,photoCategoriesResult,vehiclePhotosResult]) if (r.error) return err(r.error.message, 500);

  const tireIds = (tireResult.data ?? []).map((t) => t.id);
  const tirePhotosResult = tireIds.length
    ? await supabase.from("tire_photos").select("id,survey_tire_id,category_id,storage_path,created_at").in("survey_tire_id", tireIds).order("created_at")
    : { data: [], error: null };
  if (tirePhotosResult.error) return err(tirePhotosResult.error.message, 500);

  const categoryMap = new Map((photoCategoriesResult.data ?? []).map((c) => [c.id, c]));
  const vehiclePhotos = await Promise.all((vehiclePhotosResult.data ?? []).map(async (p) => ({ id: p.id, categoryName: categoryMap.get(p.category_id)?.name ?? "Foto", signedUrl: (await supabase.storage.from("survey-photos").createSignedUrl(p.storage_path, 3600)).data?.signedUrl ?? null })));
  const tirePhotos = await Promise.all((tirePhotosResult.data ?? []).map(async (p) => ({ id: p.id, surveyTireId: p.survey_tire_id, categoryName: categoryMap.get(p.category_id)?.name ?? "Foto", signedUrl: (await supabase.storage.from("survey-photos").createSignedUrl(p.storage_path, 3600)).data?.signedUrl ?? null })));

  const supplier = Array.isArray(surveyResult.data?.users) ? surveyResult.data.users[0] : surveyResult.data?.users;
  return NextResponse.json({ survey: { ...surveyResult.data, supplier }, tires: (tireResult.data ?? []).map((t) => ({ ...t, photos: tirePhotos.filter((p) => p.surveyTireId === t.id) })), vehiclePhotos, provinces: provincesResult.data ?? [], cities: citiesResult.data ?? [], vehicleBrands: vehicleBrandsResult.data ?? [], tireBrands: tireBrandsResult.data ?? [], tireSizes: tireSizesResult.data ?? [], tirePatterns: tirePatternsResult.data ?? [] });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { profile } = await requireRole(["qc_backend"]);
  const supabase = await createClient();
  const assignment = await supabase.from("qc_assignments").select("id").eq("survey_id", id).eq("assigned_to", profile.id).maybeSingle();
  if (assignment.error) return err(assignment.error.message, 500);
  if (!assignment.data) return err("Survey tidak ditugaskan ke akun Backend ini.", 403);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return err("Payload tidak valid.");
  const data = body as any;
  const survey = data.survey;
  const tires = Array.isArray(data.tires) ? data.tires : [];
  if (!survey || !tires.length) return err("Data Backend tidak lengkap.");

  const normalizedPlate = String(survey.plateNumber ?? "").toUpperCase().replace(/\s+/g, "");
  if (!normalizedPlate || !survey.provinceId || !survey.cityId || !survey.vehicleCategory || !survey.segment || !String(survey.companyName ?? "").trim()) return err("Data kendaraan wajib belum lengkap.");

  const { data: surveyRow, error: surveyError } = await supabase.from("surveys").select("id, status").eq("id", id).single();
  if (surveyError || !surveyRow) return err("Survey tidak ditemukan.", 404);
  if (!["QC_PASSED","BACKEND_REVIEW"].includes(surveyRow.status)) return err(`Survey berstatus ${surveyRow.status} tidak dapat diproses Backend.`);

  const duplicate = await supabase.from("surveys").select("id").eq("plate_number", normalizedPlate).neq("id", id).neq("status", "QC_DROPPED").maybeSingle();
  if (duplicate.error) return err(duplicate.error.message, 500);
  if (duplicate.data) return err("Nomor polisi sudah digunakan oleh survey aktif.");

  const { error: updateSurveyError } = await supabase.from("surveys").update({ plate_number: normalizedPlate, province_id: Number(survey.provinceId), city_id: survey.cityId === null ? null : Number(survey.cityId), city_other: String(survey.cityOther ?? "").trim() || null, vehicle_category: survey.vehicleCategory, segment: survey.segment, bus_category: survey.segment === "BUS" ? survey.busCategory || null : null, truck_category: survey.segment === "TRUCK" ? survey.truckCategory || null : null, specific_vehicle_type: String(survey.specificVehicleType ?? "").trim() || null, company_name: String(survey.companyName ?? "").trim(), vehicle_brand_id: survey.vehicleBrandId ? Number(survey.vehicleBrandId) : null, vehicle_brand_other: String(survey.vehicleBrandOther ?? "").trim() || null, cargo_type: String(survey.cargoType ?? "").trim() || null, status: "BACKEND_REVIEW" }).eq("id", id);
  if (updateSurveyError) return err(updateSurveyError.message, 500);

  for (const tire of tires) {
    const { error: tireError } = await supabase.from("survey_tires").update({ backend_brand_id: tire.backendBrandId ? Number(tire.backendBrandId) : null, backend_size_id: tire.backendSizeId ? Number(tire.backendSizeId) : null, backend_pattern_id: tire.backendPatternId ? Number(tire.backendPatternId) : null, backend_ply_rating: String(tire.backendPlyRating ?? "").trim(), supplier_is_retread: tire.supplierIsRetread, backend_status: "COMPLETED" }).eq("id", tire.id).eq("survey_id", id);
    if (tireError) return err(`Gagal menyimpan ${tire.id}: ${tireError.message}`, 500);
  }

  const requiredMissing = tires.find((t: any) => !t.backendBrandId || !t.backendSizeId || !t.backendPatternId || !String(t.backendPlyRating ?? "").trim() || t.supplierIsRetread === null || t.supplierIsRetread === undefined);
  if (requiredMissing) return err("Masih ada spesifikasi ban yang belum lengkap.");

  const { error: reviewError } = await supabase.from("backend_reviews").insert({ survey_id: id, reviewer_id: profile.id, status: "COMPLETED", comment: "Backend processing completed.", reviewed_at: new Date().toISOString() });
  if (reviewError) return err(`Gagal menyimpan review Backend: ${reviewError.message}`, 500);

  const { error: completeError } = await supabase.from("surveys").update({ status: "COMPLETED", completed_at: new Date().toISOString() }).eq("id", id);
  if (completeError) return err(`Gagal menyelesaikan survey: ${completeError.message}`, 500);

  return NextResponse.json({ ok: true, status: "COMPLETED" });
}

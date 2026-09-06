import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ReportFilterStatus = "ALL" | "PENDING" | "PASS" | "DROP";

type SurveyRow = {
  id: string;
  serial_number: string | null;
  survey_date: string;
  plate_number: string | null;
  province_id: number | null;
  city_id: number | null;
  city_other: string | null;
  supplier_id: string;
  status: string;
  updated_at: string;
};

type QcReviewRow = {
  survey_id: string;
  reviewer_id: string;
  decision: "PASS" | "DROP" | "PENDING";
  reviewed_at: string | null;
  created_at: string;
};

type BackendReviewRow = {
  survey_id: string;
  reviewer_id: string;
  status: "PENDING" | "COMPLETED" | "REVISION";
  reviewed_at: string | null;
  created_at: string;
};

type ReportUser = {
  id: string;
  user_code: string | null;
  full_name: string;
  role: "supplier" | "qc_backend" | "pm_pic" | "superadmin";
};

type SurveyReportRow = SurveyRow & {
  reportingStatus: "PENDING" | "PASS" | "DROP";
  qcUserId: string | null;
  backendUserId: string | null;
};

function normalizeStatus(value: string | null | undefined): ReportFilterStatus {
  const normalized = (value ?? "ALL").toUpperCase();
  if (normalized === "PENDING" || normalized === "PASS" || normalized === "DROP") return normalized;
  return "ALL";
}

function reportingStatus(status: string): SurveyReportRow["reportingStatus"] {
  if (status === "QC_DROPPED") return "DROP";
  if (["QC_PASSED", "BACKEND_REVIEW", "BACKEND_REVISION", "COMPLETED"].includes(status)) return "PASS";
  return "PENDING";
}

function displayUser(user: ReportUser | undefined) {
  if (!user) return "-";
  return user.user_code ? `${user.user_code} — ${user.full_name}` : user.full_name;
}

function matchesUser(user: ReportUser | undefined, query: string) {
  if (!user || !query) return false;
  const needle = query.toLowerCase();
  return [user.id, user.user_code ?? "", user.full_name].some((value) => value.toLowerCase().includes(needle));
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "report";
}

export async function GET(request: Request) {
  try {
    const { profile } = await requireRole(["pm_pic"]);
    const url = new URL(request.url);
    const userQuery = (url.searchParams.get("user_id") ?? "").trim();
    const fromDate = url.searchParams.get("from") ?? "";
    const toDate = url.searchParams.get("to") ?? "";
    const selectedStatus = normalizeStatus(url.searchParams.get("status"));

    const supabase = await createClient();
    const [surveysResult, qcReviewsResult, backendReviewsResult, provincesResult, citiesResult, usersResult] = await Promise.all([
      supabase
        .from("surveys")
        .select("id, serial_number, survey_date, plate_number, province_id, city_id, city_other, supplier_id, status, updated_at")
        .order("updated_at", { ascending: false })
        .limit(5000),
      supabase
        .from("qc_reviews")
        .select("survey_id, reviewer_id, decision, reviewed_at, created_at")
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase
        .from("backend_reviews")
        .select("survey_id, reviewer_id, status, reviewed_at, created_at")
        .order("created_at", { ascending: false })
        .limit(10000),
      supabase.from("master_provinces").select("id, name").eq("is_active", true).order("name"),
      supabase.from("master_cities").select("id, name, province_id").eq("is_active", true).order("name"),
      supabase.rpc("get_report_user_profiles"),
    ]);

    for (const result of [surveysResult, qcReviewsResult, backendReviewsResult, provincesResult, citiesResult, usersResult]) {
      if (result.error) throw new Error(result.error.message);
    }

    const userMap = new Map<string, ReportUser>((usersResult.data ?? []).map((row) => [row.id, row as ReportUser]));
    const qcMap = new Map<string, QcReviewRow>();
    for (const review of (qcReviewsResult.data ?? []) as QcReviewRow[]) {
      if (!qcMap.has(review.survey_id)) qcMap.set(review.survey_id, review);
    }
    const backendMap = new Map<string, BackendReviewRow>();
    for (const review of (backendReviewsResult.data ?? []) as BackendReviewRow[]) {
      if (!backendMap.has(review.survey_id)) backendMap.set(review.survey_id, review);
    }
    const provinceMap = new Map((provincesResult.data ?? []).map((row) => [row.id, row.name]));
    const cityMap = new Map((citiesResult.data ?? []).map((row) => [row.id, row.name]));

    const reports: SurveyReportRow[] = ((surveysResult.data ?? []) as SurveyRow[]).map((survey) => ({
      ...survey,
      reportingStatus: reportingStatus(survey.status),
      qcUserId: qcMap.get(survey.id)?.reviewer_id ?? null,
      backendUserId: backendMap.get(survey.id)?.reviewer_id ?? null,
    }));

    const filteredReports = reports.filter((row) => {
      if (fromDate && row.survey_date < fromDate) return false;
      if (toDate && row.survey_date > toDate) return false;
      if (selectedStatus !== "ALL" && row.reportingStatus !== selectedStatus) return false;
      if (userQuery) {
        const matches = [row.supplier_id, row.qcUserId, row.backendUserId].some((id) => matchesUser(userMap.get(id ?? ""), userQuery));
        if (!matches) return false;
      }
      return true;
    });

    const supplierWork = filteredReports.filter((row) => row.status !== "DRAFT").length;
    const qcWork = filteredReports.filter((row) => row.qcUserId).length;
    const backendWork = filteredReports.filter((row) => row.backendUserId).length;
    const pendingCount = filteredReports.filter((row) => row.reportingStatus === "PENDING").length;
    const passCount = filteredReports.filter((row) => row.reportingStatus === "PASS").length;
    const dropCount = filteredReports.filter((row) => row.reportingStatus === "DROP").length;

    const locationMap = new Map<string, { province: string; city: string; survey: number; supplier: number; qc: number; backend: number; pass: number; drop: number; pending: number }>();
    for (const row of filteredReports) {
      const province = row.province_id ? provinceMap.get(row.province_id) ?? "-" : "-";
      const city = row.city_other?.trim() || (row.city_id ? cityMap.get(row.city_id) : null) || "-";
      const key = `${province}\u0000${city}`;
      const current = locationMap.get(key) ?? { province, city, survey: 0, supplier: 0, qc: 0, backend: 0, pass: 0, drop: 0, pending: 0 };
      current.survey += 1;
      if (row.status !== "DRAFT") current.supplier += 1;
      if (row.qcUserId) current.qc += 1;
      if (row.backendUserId) current.backend += 1;
      if (row.reportingStatus === "PASS") current.pass += 1;
      else if (row.reportingStatus === "DROP") current.drop += 1;
      else current.pending += 1;
      locationMap.set(key, current);
    }
    const locationStats = Array.from(locationMap.values()).sort((a, b) => a.province.localeCompare(b.province) || a.city.localeCompare(b.city));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Tire Survey WebApp";
    workbook.created = new Date();

    const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } } as const;
    const headerFont = { color: { argb: "FFFFFFFF" }, bold: true };

    const summary = workbook.addWorksheet("Summary");
    summary.columns = [
      { header: "Metric", key: "metric", width: 26 },
      { header: "Value", key: "value", width: 16 },
    ];
    ["metric", "value"].forEach((key) => {
      const cell = summary.getRow(1).getCell(key === "metric" ? 1 : 2);
      cell.fill = headerFill;
      cell.font = headerFont;
    });
    summary.addRows([
      ["PM/PIC", `${profile.user_code ?? profile.full_name} — ${profile.full_name}`],
      ["Filter User", userQuery || "Semua"],
      ["Dari tanggal", fromDate || "Semua"],
      ["Sampai tanggal", toDate || "Semua"],
      ["Filter Status", selectedStatus],
      ["", ""],
      ["Total Survey", filteredReports.length],
      ["Supplier Work", supplierWork],
      ["QC Work", qcWork],
      ["Backend Work", backendWork],
      ["Pending", pendingCount],
      ["Pass", passCount],
      ["Drop", dropCount],
    ]);
    summary.views = [{ state: "frozen", ySplit: 1 }];

    const history = workbook.addWorksheet("Survey History");
    history.columns = [
      { header: "Serial Number", key: "serial_number", width: 18 },
      { header: "Supplier", key: "supplier", width: 30 },
      { header: "Plat", key: "plate", width: 16 },
      { header: "Provinsi", key: "province", width: 22 },
      { header: "Kota", key: "city", width: 22 },
      { header: "QC", key: "qc", width: 30 },
      { header: "Backend", key: "backend", width: 30 },
      { header: "Tanggal Survey", key: "survey_date", width: 16 },
      { header: "Status", key: "status", width: 14 },
      { header: "Last Update", key: "updated_at", width: 22 },
      { header: "Survey ID", key: "survey_id", width: 38 },
    ];
    history.getRow(1).eachCell((cell) => { cell.fill = headerFill; cell.font = headerFont; });
    for (const row of filteredReports) {
      history.addRow({
        serial_number: row.serial_number ?? "-",
        supplier: displayUser(userMap.get(row.supplier_id)),
        plate: row.plate_number ?? "-",
        province: row.province_id ? provinceMap.get(row.province_id) ?? "-" : "-",
        city: row.city_other?.trim() || (row.city_id ? cityMap.get(row.city_id) : null) || "-",
        qc: displayUser(userMap.get(row.qcUserId ?? "")),
        backend: displayUser(userMap.get(row.backendUserId ?? "")),
        survey_date: row.survey_date,
        status: row.reportingStatus,
        updated_at: row.updated_at,
        survey_id: row.id,
      });
    }
    history.views = [{ state: "frozen", ySplit: 1 }];
    history.autoFilter = { from: "A1", to: `K${Math.max(1, filteredReports.length + 1)}` };

    const location = workbook.addWorksheet("Province x City");
    location.columns = [
      { header: "Provinsi", key: "province", width: 22 },
      { header: "Kota", key: "city", width: 22 },
      { header: "Survey", key: "survey", width: 12 },
      { header: "Supplier", key: "supplier", width: 12 },
      { header: "QC", key: "qc", width: 12 },
      { header: "Backend", key: "backend", width: 12 },
      { header: "Pass", key: "pass", width: 12 },
      { header: "Drop", key: "drop", width: 12 },
      { header: "Pending", key: "pending", width: 12 },
    ];
    location.getRow(1).eachCell((cell) => { cell.fill = headerFill; cell.font = headerFont; });
    location.addRows(locationStats);
    location.views = [{ state: "frozen", ySplit: 1 }];
    location.autoFilter = { from: "A1", to: `I${Math.max(1, locationStats.length + 1)}` };

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `tire-survey-report-${safeFilePart(fromDate || "all")}-${safeFilePart(toDate || "all")}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat laporan XLSX.";
    return NextResponse.json({ error: `Gagal membuat laporan XLSX: ${message}` }, { status: 500 });
  }
}

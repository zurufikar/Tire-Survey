import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ReportFilterStatus = "ALL" | "PENDING" | "PASS" | "DROP";
type ReportView = "SUMMARY" | "LOCATION" | "HISTORY";

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

function normalizeView(value: string | null | undefined): ReportView {
  if (value === "LOCATION" || value === "HISTORY") return value;
  return "SUMMARY";
}

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: SurveyReportRow["reportingStatus"]) {
  if (status === "PASS") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "DROP") return "bg-red-50 text-red-700 ring-red-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { profile } = await requireRole(["pm_pic"]);
  const params = await searchParams;
  const userQuery = typeof params.user_id === "string" ? params.user_id.trim() : "";
  const fromDate = typeof params.from === "string" ? params.from : "";
  const toDate = typeof params.to === "string" ? params.to : "";
  const selectedStatus = normalizeStatus(typeof params.status === "string" ? params.status : undefined);
  const selectedView = normalizeView(typeof params.view === "string" ? params.view : undefined);
  const selectedProvinceId = typeof params.province_id === "string" ? params.province_id : "";
  const selectedCityId = typeof params.city_id === "string" ? params.city_id : "";

  const supabase = await createClient();

  const [surveysResult, qcReviewsResult, backendReviewsResult, provincesResult, citiesResult, usersResult] =
    await Promise.all([
      supabase
        .from("surveys")
        .select("id, serial_number, survey_date, plate_number, province_id, city_id, city_other, supplier_id, status, updated_at")
        .order("updated_at", { ascending: false })
        .limit(2000),
      supabase
        .from("qc_reviews")
        .select("survey_id, reviewer_id, decision, reviewed_at, created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("backend_reviews")
        .select("survey_id, reviewer_id, status, reviewed_at, created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("master_provinces").select("id, name").eq("is_active", true).order("name"),
      supabase.from("master_cities").select("id, name").eq("is_active", true).order("name"),
      supabase.rpc("get_report_user_profiles"),
    ]);

  for (const result of [surveysResult, qcReviewsResult, backendReviewsResult, provincesResult, citiesResult, usersResult]) {
    if (result.error) throw new Error(`Gagal memuat laporan: ${result.error.message}`);
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
  const cityOptions = (citiesResult.data ?? []).filter((row) =>
    !selectedProvinceId || String(row.province_id) === selectedProvinceId
  );

  const activeProvinceName = selectedProvinceId
    ? provinceMap.get(Number(selectedProvinceId)) ?? "Provinsi"
    : "Semua Provinsi";
  const activeCityName = selectedCityId
    ? cityMap.get(Number(selectedCityId)) ?? "Kota"
    : "Semua Kota";

  const allReports: SurveyReportRow[] = ((surveysResult.data ?? []) as SurveyRow[]).map((survey) => ({
    ...survey,
    reportingStatus: reportingStatus(survey.status),
    qcUserId: qcMap.get(survey.id)?.reviewer_id ?? null,
    backendUserId: backendMap.get(survey.id)?.reviewer_id ?? null,
  }));

  const baseFilteredReports = allReports.filter((row) => {
    if (fromDate && row.survey_date < fromDate) return false;
    if (toDate && row.survey_date > toDate) return false;
    if (selectedStatus !== "ALL" && row.reportingStatus !== selectedStatus) return false;
    if (userQuery) {
      const matches = [row.supplier_id, row.qcUserId, row.backendUserId].some((id) => matchesUser(userMap.get(id ?? ""), userQuery));
      if (!matches) return false;
    }
    return true;
  });

  const filteredReports = baseFilteredReports.filter((row) => {
    if (selectedProvinceId && String(row.province_id ?? "") !== selectedProvinceId) return false;
    if (selectedCityId && String(row.city_id ?? "") !== selectedCityId) return false;
    return true;
  });

  const supplierWork = filteredReports.filter((row) => row.status !== "DRAFT").length;
  const qcWork = filteredReports.filter((row) => row.qcUserId).length;
  const backendWork = filteredReports.filter((row) => row.backendUserId).length;
  const pendingCount = filteredReports.filter((row) => row.reportingStatus === "PENDING").length;
  const passCount = filteredReports.filter((row) => row.reportingStatus === "PASS").length;
  const dropCount = filteredReports.filter((row) => row.reportingStatus === "DROP").length;
  const supplierUsers = (usersResult.data ?? []).filter((user) => user.role === "supplier") as ReportUser[];

  const statusTotal = filteredReports.length;
  const statusStats = [
    { label: "Pass", value: passCount },
    { label: "Pending", value: pendingCount },
    { label: "Drop", value: dropCount },
  ];

  const supplierStats = supplierUsers
    .map((user) => {
      const surveyCount = filteredReports.filter((row) => row.supplier_id === user.id).length;
      return { user, surveyCount };
    })
    .filter((item) => item.surveyCount > 0)
    .sort((a, b) => b.surveyCount - a.surveyCount || (a.user.user_code ?? "").localeCompare(b.user.user_code ?? ""));

  const locationStats = Array.from(
    filteredReports.reduce((map, row) => {
      const province = row.province_id ? provinceMap.get(row.province_id) ?? "-" : "-";
      const city = row.city_other?.trim() || (row.city_id ? cityMap.get(row.city_id) : null) || "-";
      const key = `${province}\u0000${city}`;
      const current = map.get(key) ?? { province, city, survey: 0, supplier: 0, qc: 0, backend: 0, pass: 0, drop: 0, pending: 0 };
      current.survey += 1;
      if (row.status !== "DRAFT") current.supplier += 1;
      if (row.qcUserId) current.qc += 1;
      if (row.backendUserId) current.backend += 1;
      if (row.reportingStatus === "PASS") current.pass += 1;
      else if (row.reportingStatus === "DROP") current.drop += 1;
      else current.pending += 1;
      map.set(key, current);
      return map;
    }, new Map<string, { province: string; city: string; survey: number; supplier: number; qc: number; backend: number; pass: number; drop: number; pending: number }>() )
  ).map(([, value]) => value).sort((a, b) => a.province.localeCompare(b.province) || a.city.localeCompare(b.city));

  const exportHref = () => {
    const query = new URLSearchParams();
    if (userQuery) query.set("user_id", userQuery);
    if (fromDate) query.set("from", fromDate);
    if (toDate) query.set("to", toDate);
    if (selectedStatus !== "ALL") query.set("status", selectedStatus);
    return `/api/reports/export${query.toString() ? `?${query.toString()}` : ""}`;
  };

  const reportHref = (view: ReportView) => {
    const query = new URLSearchParams();
    if (view !== "SUMMARY") query.set("view", view);
    if (userQuery) query.set("user_id", userQuery);
    if (fromDate) query.set("from", fromDate);
    if (toDate) query.set("to", toDate);
    if (selectedStatus !== "ALL") query.set("status", selectedStatus);
    if (view === "LOCATION" && selectedProvinceId) query.set("province_id", selectedProvinceId);
    if (view === "LOCATION" && selectedCityId) query.set("city_id", selectedCityId);
    const value = query.toString();
    return value ? `/reports?${value}` : "/reports";
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div>
            <p className="text-sm font-medium text-blue-600">PM / PIC Dashboard</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Monitoring Survey</h1>
            <p className="mt-1 text-sm text-slate-500">Read-only • {profile.full_name}</p>
          </div>
        </header>

        <nav className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
          <div className="grid grid-cols-3 gap-2">
            {([
              ["SUMMARY", "Ringkasan"],
              ["LOCATION", "Wilayah"],
              ["HISTORY", "Riwayat"],
            ] as const).map(([view, label]) => (
              <Link
                key={view}
                href={reportHref(view)}
                className={`rounded-xl px-4 py-2.5 text-center text-sm font-medium transition ${
                  selectedView === view
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">Filter Laporan</h2>
            <p className="mt-1 text-xs text-slate-500">
              Gunakan filter umum untuk seluruh dashboard. Pada mode Wilayah, pilih provinsi/kota agar statistik lokasi tetap ringkas.
            </p>
          </div>
          <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <input type="hidden" name="view" value={selectedView} />
            <label className="text-sm font-medium text-slate-700">
              User
              <input name="user_id" defaultValue={userQuery} list="report-user-options" className="input mt-1" placeholder="User Code / Nama" />
              <datalist id="report-user-options">
                {supplierUsers.map((user) => <option key={user.id} value={user.user_code ?? user.full_name}>{displayUser(user)}</option>)}
              </datalist>
            </label>
            <label className="text-sm font-medium text-slate-700">Dari tanggal<input name="from" type="date" defaultValue={fromDate} className="input mt-1" /></label>
            <label className="text-sm font-medium text-slate-700">Sampai tanggal<input name="to" type="date" defaultValue={toDate} className="input mt-1" /></label>
            <label className="text-sm font-medium text-slate-700">Status<select name="status" defaultValue={selectedStatus} className="input mt-1"><option value="ALL">Semua</option><option value="PENDING">Pending</option><option value="PASS">Pass</option><option value="DROP">Drop</option></select></label>
            <label className="text-sm font-medium text-slate-700">Provinsi<select name="province_id" defaultValue={selectedProvinceId} className="input mt-1"><option value="">Semua Provinsi</option>{(provincesResult.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label className="text-sm font-medium text-slate-700">Kota<select name="city_id" defaultValue={selectedCityId} className="input mt-1" disabled={!selectedProvinceId}><option value="">Semua Kota</option>{cityOptions.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <div className="flex items-end gap-2"><button type="submit" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Terapkan</button><Link href="/reports" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Reset</Link><a href={exportHref()} className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100">Export XLSX</a></div>
          </form>
        </section>

        {selectedView === "SUMMARY" ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {[["Supplier", supplierWork], ["QC", qcWork], ["Backend", backendWork], ["Pending", pendingCount], ["Pass", passCount], ["Drop", dropCount]].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-slate-900">Statistik Status</h2>
                  <p className="mt-1 text-xs text-slate-500">Distribusi status berdasarkan filter aktif.</p>
                </div>
                <div className="space-y-4">
                  {statusStats.map((item) => {
                    const percentage = statusTotal ? Math.round((item.value / statusTotal) * 100) : 0;
                    return <div key={item.label}><div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium text-slate-700">{item.label}</span><span className="text-slate-500">{item.value} ({percentage}%)</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${percentage}%` }} /></div></div>;
                  })}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-slate-900">Statistik per Supplier</h2>
                  <p className="mt-1 text-xs text-slate-500">Jumlah survey berdasarkan supplier pada filter aktif.</p>
                </div>
                {supplierStats.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Belum ada data supplier sesuai filter.</p> : <div className="space-y-3">{supplierStats.slice(0, 10).map((item) => { const percentage = statusTotal ? Math.round((item.surveyCount / statusTotal) * 100) : 0; return <div key={item.user.id}><div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium text-slate-700">{displayUser(item.user)}</span><span className="shrink-0 text-slate-500">{item.surveyCount}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-700" style={{ width: `${percentage}%` }} /></div></div>; })}{supplierStats.length > 10 ? <p className="pt-1 text-xs text-slate-500">Menampilkan 10 supplier teratas.</p> : null}</div>}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div><h2 className="text-base font-semibold text-slate-900">Statistik Wilayah</h2><p className="mt-1 text-xs text-slate-500">Matrix Provinsi × Kota dipindahkan ke mode Wilayah agar halaman utama tetap ringkas.</p></div>
                <Link href={reportHref("LOCATION")} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Buka Statistik Wilayah</Link>
              </div>
            </section>
          </>
        ) : null}

        {selectedView === "LOCATION" ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[ ["Cakupan", filteredReports.length], ["Provinsi", activeProvinceName], ["Kota", activeCityName], ["Pass", passCount] ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold text-slate-900">{value}</p></div>
              ))}
            </section>
            <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-base font-semibold text-slate-900">Provinsi × Kota</h2><p className="mt-1 text-xs text-slate-500">Menampilkan hanya wilayah yang dipilih. Tidak ada infinite scrolling pada mode ini.</p></div>
              <div className="overflow-x-auto">
                <table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Provinsi</th><th className="px-5 py-3">Kota</th><th className="px-5 py-3 text-center">Survey</th><th className="px-5 py-3 text-center">Supplier</th><th className="px-5 py-3 text-center">QC</th><th className="px-5 py-3 text-center">Backend</th><th className="px-5 py-3 text-center">Pass</th><th className="px-5 py-3 text-center">Drop</th><th className="px-5 py-3 text-center">Pending</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{locationStats.map((item) => <tr key={`${item.province}-${item.city}`} className="hover:bg-slate-50"><td className="px-5 py-3 font-medium text-slate-900">{item.province}</td><td className="px-5 py-3 text-slate-700">{item.city}</td><td className="px-5 py-3 text-center font-medium">{item.survey}</td><td className="px-5 py-3 text-center">{item.supplier}</td><td className="px-5 py-3 text-center">{item.qc}</td><td className="px-5 py-3 text-center">{item.backend}</td><td className="px-5 py-3 text-center text-emerald-700">{item.pass}</td><td className="px-5 py-3 text-center text-red-700">{item.drop}</td><td className="px-5 py-3 text-center text-amber-700">{item.pending}</td></tr>)}{locationStats.length === 0 ? <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500">Tidak ada data lokasi yang sesuai filter.</td></tr> : null}</tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        {selectedView === "HISTORY" ? (
          <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between"><div><h2 className="text-base font-semibold text-slate-900">History Survey</h2><p className="text-xs text-slate-500">{filteredReports.length} data sesuai filter</p></div><div className="text-xs text-slate-500">Read-only</div></div>
            <div className="max-h-[70vh] overflow-auto">
              <div className="overflow-x-auto"><table className="min-w-[1250px] w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Serial Number</th><th className="px-5 py-3">Supplier</th><th className="px-5 py-3">Plat</th><th className="px-5 py-3">Provinsi / Kota</th><th className="px-5 py-3">QC</th><th className="px-5 py-3">Backend</th><th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Update</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredReports.map((row) => { const province = row.province_id ? provinceMap.get(row.province_id) ?? "-" : "-"; const city = row.city_other?.trim() || (row.city_id ? cityMap.get(row.city_id) : null) || "-"; return <tr key={row.id} className="align-top hover:bg-slate-50"><td className="px-5 py-4 font-medium text-slate-900">{row.serial_number ? <Link href={`/survey/${row.id}/view`} className="text-blue-700 hover:underline">{row.serial_number}</Link> : "-"}</td><td className="px-5 py-4 font-medium text-slate-700">{displayUser(userMap.get(row.supplier_id))}</td><td className="px-5 py-4">{row.plate_number || "-"}</td><td className="px-5 py-4"><div>{province}</div><div className="text-xs text-slate-500">{city}</div></td><td className="px-5 py-4 text-xs text-slate-600">{displayUser(userMap.get(row.qcUserId ?? ""))}</td><td className="px-5 py-4 text-xs text-slate-600">{displayUser(userMap.get(row.backendUserId ?? ""))}</td><td className="px-5 py-4">{formatDate(row.survey_date)}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${statusClass(row.reportingStatus)}`}>{row.reportingStatus}</span></td><td className="px-5 py-4 text-xs text-slate-500">{formatDateTime(row.updated_at)}</td></tr>; })}{filteredReports.length === 0 ? <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500">Tidak ada data yang sesuai filter.</td></tr> : null}</tbody></table></div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

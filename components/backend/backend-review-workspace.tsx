"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: number; name: string };
type SizeOption = { id: number; size: string; vehicle_category: "TB" | "LT" };
type PatternOption = { id: number; pattern: string; application: string | null; tire_brand_id: number; vehicle_category: "TB" | "LT" };

type Photo = { id: string; categoryName: string; signedUrl: string | null };
type Tire = {
  id: string;
  position_name: string;
  position_code: string;
  side: "LEFT" | "RIGHT";
  axle_type: string;
  axle_number: number;
  tire_layer: string;
  supplier_is_retread: boolean | null;
  backend_brand_id: number | null;
  backend_size_id: number | null;
  backend_pattern_id: number | null;
  backend_ply_rating: string | null;
  backend_status: string;
  photos: Photo[];
};

type Survey = {
  id: string;
  serialNumber: string | null;
  plateNumber: string;
  provinceId: number | null;
  cityId: number | null;
  cityOther: string | null;
  vehicleCategory: "TB" | "LT" | null;
  segment: "BUS" | "TRUCK" | null;
  busCategory: string | null;
  truckCategory: string | null;
  specificVehicleType: string | null;
  companyName: string | null;
  vehicleBrandId: number | null;
  vehicleBrandOther: string | null;
  cargoType: string | null;
  supplierName: string;
  supplierCode: string | null;
  status: string;
};

type Props = {
  survey: Survey;
  provinces: Option[];
  cities: Array<Option & { province_id: number }>;
  vehicleBrands: Option[];
  tireBrands: Option[];
  tireSizes: SizeOption[];
  tirePatterns: PatternOption[];
  tires: Tire[];
};

const busOptions = [
  ["INTERCITY_BUS", "Intercity Bus"],
  ["CITY_BUS", "City Bus"],
] as const;
const truckOptions = [
  ["GENERAL_CARGO", "General Cargo"],
  ["DUMP_TRUCK", "Dump Truck"],
  ["TANKER", "Tanker"],
  ["TRAILER", "Trailer"],
] as const;
const cargoOptions = [
  ["CARGO_TRUCK", "Cargo Truck"],
  ["BOX_TRUCK", "Box Truck"],
  ["CAR_CARRIER", "Car Carrier"],
  ["MIXER", "Mixer"],
  ["FLAT_DECK_TRUCK", "Flat Deck Truck"],
  ["OTHER", "Lainnya"],
] as const;
const tankerOptions = [
  ["TANGKI_BBM", "Tangki BBM"],
  ["TANGKI_AIR", "Tangki Air"],
  ["TANGKI_KIMIA", "Tangki Kimia"],
  ["OTHER", "Lainnya"],
] as const;

function formatLabel(value: string | null | undefined) {
  if (!value) return "-";
  return value.replaceAll("_", " ");
}

export function BackendReviewWorkspace({ survey, provinces, cities, vehicleBrands, tireBrands, tireSizes, tirePatterns, tires }: Props) {
  const router = useRouter();
  const [plate, setPlate] = useState(survey.plateNumber);
  const [provinceId, setProvinceId] = useState(survey.provinceId ? String(survey.provinceId) : "");
  const [cityId, setCityId] = useState(survey.cityId ? String(survey.cityId) : "");
  const [cityOther, setCityOther] = useState(survey.cityOther ?? "");
  const [vehicleCategory, setVehicleCategory] = useState(survey.vehicleCategory ?? "");
  const [segment, setSegment] = useState(survey.segment ?? "");
  const [busCategory, setBusCategory] = useState(survey.busCategory ?? "");
  const [truckCategory, setTruckCategory] = useState(survey.truckCategory ?? "");
  const [specificVehicleType, setSpecificVehicleType] = useState(survey.specificVehicleType ?? "");
  const [companyName, setCompanyName] = useState(survey.companyName ?? "");
  const [vehicleBrandId, setVehicleBrandId] = useState(survey.vehicleBrandId ? String(survey.vehicleBrandId) : "");
  const [vehicleBrandOther, setVehicleBrandOther] = useState(survey.vehicleBrandOther ?? "");
  const [cargoType, setCargoType] = useState(survey.cargoType ?? "");
  const [rows, setRows] = useState(tires);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null);
  const [editingVehicle, setEditingVehicle] = useState(false);

  const vehicleReadOnly = !editingVehicle;

  const filteredCities = useMemo(() => {
    const pid = Number(provinceId);
    return Number.isFinite(pid) ? cities.filter((c) => c.province_id === pid) : [];
  }, [cities, provinceId]);

  const filteredSizes = useMemo(() => {
    if (!vehicleCategory) return [];
    return tireSizes.filter((s) => s.vehicle_category === vehicleCategory);
  }, [tireSizes, vehicleCategory]);

  const leftTires = rows.filter((t) => t.side === "LEFT");
  const rightTires = rows.filter((t) => t.side === "RIGHT");

  function updateTire(id: string, patch: Partial<Tire>) {
    setRows((current) => current.map((t) => t.id === id ? { ...t, ...patch } : t));
  }

  async function saveCompleted() {
    setSaving(true);
    setError("");
    try {
      if (!plate.trim() || !provinceId || !cityId || !vehicleCategory || !segment || !companyName.trim()) {
        throw new Error("Lengkapi data kendaraan wajib sebelum Submit Backend.");
      }

      for (const tire of rows) {
        if (!tire.backend_brand_id || !tire.backend_size_id || !tire.backend_pattern_id || !tire.backend_ply_rating?.trim() || tire.supplier_is_retread === null) {
          throw new Error(`Spesifikasi belum lengkap: ${tire.position_name}`);
        }
      }

      const response = await fetch(`/api/backend/${survey.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survey: {
            plateNumber: plate,
            provinceId: Number(provinceId),
            cityId: cityId === "OTHER" ? null : Number(cityId),
            cityOther: cityId === "OTHER" ? cityOther.trim() : "",
            vehicleCategory,
            segment,
            busCategory: segment === "BUS" ? busCategory : null,
            truckCategory: segment === "TRUCK" ? truckCategory : null,
            specificVehicleType: specificVehicleType.trim(),
            companyName: companyName.trim(),
            vehicleBrandId: vehicleBrandId ? Number(vehicleBrandId) : null,
            vehicleBrandOther: vehicleBrandId === "OTHER" ? vehicleBrandOther.trim() : "",
            cargoType: cargoType.trim(),
          },
          tires: rows.map((tire) => ({
            id: tire.id,
            backendBrandId: tire.backend_brand_id,
            backendSizeId: tire.backend_size_id,
            backendPatternId: tire.backend_pattern_id,
            backendPlyRating: tire.backend_ply_rating?.trim() ?? "",
            supplierIsRetread: tire.supplier_is_retread,
          })),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? "Gagal menyelesaikan Backend.");
      router.push("/backend");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal menyelesaikan Backend.");
    } finally {
      setSaving(false);
    }
  }

  function renderTireCard(tire: Tire) {
    const patterns = tire.backend_brand_id
      ? tirePatterns.filter((p) => p.tire_brand_id === tire.backend_brand_id && (!vehicleCategory || p.vehicle_category === vehicleCategory))
      : [];
    return (
      <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">{tire.position_name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{tire.axle_type} · Poros {tire.axle_number} · {tire.tire_layer}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">Supplier Vulkanisir: {tire.supplier_is_retread === null ? "-" : tire.supplier_is_retread ? "Y" : "N"}</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {tire.photos.length ? tire.photos.map((photo) => (
            <button key={photo.id} type="button" onClick={() => setActivePhoto(photo)} className="h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {photo.signedUrl ? <img src={photo.signedUrl} alt={photo.categoryName} className="h-full w-full object-cover" /> : <span className="p-1 text-[10px] text-slate-400">Tidak tersedia</span>}
            </button>
          )) : <p className="text-xs text-slate-400">Belum ada foto.</p>}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Merk *</span>
            <select value={tire.backend_brand_id ?? ""} onChange={(e) => updateTire(tire.id, { backend_brand_id: e.target.value ? Number(e.target.value) : null, backend_pattern_id: null })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Pilih merk</option>{tireBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Ukuran *</span>
            <select value={tire.backend_size_id ?? ""} onChange={(e) => updateTire(tire.id, { backend_size_id: e.target.value ? Number(e.target.value) : null })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Pilih ukuran</option>{filteredSizes.map((s) => <option key={s.id} value={s.id}>{s.size}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Pattern *</span>
            <select value={tire.backend_pattern_id ?? ""} onChange={(e) => updateTire(tire.id, { backend_pattern_id: e.target.value ? Number(e.target.value) : null })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Pilih pattern</option>{patterns.map((p) => <option key={p.id} value={p.id}>{p.pattern}{p.application ? ` · ${p.application}` : ""}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">PR (Ply Rating) *</span>
            <input value={tire.backend_ply_rating ?? ""} onChange={(e) => updateTire(tire.id, { backend_ply_rating: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="contoh: 16PR" />
          </label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Vulkanisir *</span>
            <select value={tire.supplier_is_retread === null ? "" : tire.supplier_is_retread ? "Y" : "N"} onChange={(e) => updateTire(tire.id, { supplier_is_retread: e.target.value === "" ? null : e.target.value === "Y" })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Pilih</option><option value="Y">Y</option><option value="N">N</option>
            </select>
          </label>
        </div>
      </article>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs text-slate-500">Backend Review</p><h1 className="text-2xl font-semibold text-slate-900">{survey.serialNumber ?? "Tanpa Serial"}</h1><p className="mt-1 text-sm text-slate-500">Supplier: {survey.supplierName} {survey.supplierCode ? `(${survey.supplierCode})` : ""}</p></div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{survey.status}</span>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Data Kendaraan</h2>
              <p className="mt-1 text-sm text-slate-500">Data dari Supplier dimigrasikan otomatis ke Backend dan tetap read-only sampai Backend memilih untuk mengoreksinya.</p>
            </div>
            <button
              type="button"
              onClick={() => setEditingVehicle((current) => !current)}
              className={editingVehicle
                ? "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                : "rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"}
            >
              {editingVehicle ? "Selesai Edit Data Kendaraan" : "Edit Data Kendaraan"}
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label>Nomor Polisi *<input disabled={vehicleReadOnly} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase().replace(/\s+/g, ""))} className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600" /></label>
            <label>Provinsi *<select disabled={vehicleReadOnly} value={provinceId} onChange={(e) => { setProvinceId(e.target.value); setCityId(""); setCityOther(""); }} className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"><option value="">Pilih</option>{provinces.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Kota *<select disabled={vehicleReadOnly} value={cityId} onChange={(e) => { setCityId(e.target.value); if (e.target.value !== "OTHER") setCityOther(""); }} className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"><option value="">Pilih</option>{filteredCities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="OTHER">Lainnya</option></select>{cityId === "OTHER" && <input disabled={vehicleReadOnly} value={cityOther} onChange={(e) => setCityOther(e.target.value)} className="input mt-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600" placeholder="Tulis nama kota" />}</label>
            <label>Kategori Kendaraan *<select disabled={vehicleReadOnly} value={vehicleCategory} onChange={(e) => setVehicleCategory(e.target.value as "TB" | "LT" | "")} className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"><option value="">Pilih</option><option value="TB">Truck/Bus</option><option value="LT">Light Truck</option></select></label>
            <label>Segmen *<select disabled={vehicleReadOnly} value={segment} onChange={(e) => { setSegment(e.target.value as "BUS" | "TRUCK" | ""); setBusCategory(""); setTruckCategory(""); setSpecificVehicleType(""); }} className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"><option value="">Pilih</option><option value="BUS">Bus</option><option value="TRUCK">Truck</option></select></label>
            {segment === "BUS" && <label>Kategori Bus *<select disabled={vehicleReadOnly} value={busCategory} onChange={(e) => setBusCategory(e.target.value)} className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"><option value="">Pilih</option>{busOptions.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
            {segment === "TRUCK" && <label>Kategori Truck *<select disabled={vehicleReadOnly} value={truckCategory} onChange={(e) => { setTruckCategory(e.target.value); setSpecificVehicleType(""); }} className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"><option value="">Pilih</option>{truckOptions.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
            {segment === "TRUCK" && truckCategory === "GENERAL_CARGO" && <label>Spesifik Cargo *<select disabled={vehicleReadOnly} value={specificVehicleType} onChange={(e) => setSpecificVehicleType(e.target.value)} className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"><option value="">Pilih</option>{cargoOptions.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
            {segment === "TRUCK" && truckCategory === "TANKER" && <label>Spesifik Tanker *<select disabled={vehicleReadOnly} value={specificVehicleType} onChange={(e) => setSpecificVehicleType(e.target.value)} className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"><option value="">Pilih</option>{tankerOptions.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
            <label>Perusahaan / Fleet *<input disabled={vehicleReadOnly} value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600" /></label>
            <label>Merk Kendaraan<select disabled={vehicleReadOnly} value={vehicleBrandId} onChange={(e) => { setVehicleBrandId(e.target.value); if (e.target.value !== "OTHER") setVehicleBrandOther(""); }} className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600"><option value="">Pilih</option>{vehicleBrands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}<option value="OTHER">Lainnya</option></select>{vehicleBrandId === "OTHER" && <input disabled={vehicleReadOnly} value={vehicleBrandOther} onChange={(e) => setVehicleBrandOther(e.target.value)} className="input mt-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600" placeholder="Tulis merk kendaraan" />}</label>
            <label>Jenis Muatan<input disabled={vehicleReadOnly} value={cargoType} onChange={(e) => setCargoType(e.target.value)} className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-600" /></label>
          </div>

          {editingVehicle && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Mode edit aktif. Perubahan data kendaraan akan tersimpan saat Backend disubmit.</p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold text-slate-900">Spesifikasi Ban</h2><p className="mt-1 text-sm text-slate-500">Semua foto Supplier ditampilkan. Klik thumbnail untuk melihat lebih besar.</p></div><span className="text-xs text-slate-500">{rows.length} posisi ban</span></div>
          <div className="mt-4 grid gap-5 xl:grid-cols-2"><div className="space-y-3"><h3 className="text-sm font-semibold text-slate-700">Ban Sebelah Kiri</h3>{leftTires.map((t) => <div key={t.id}>{renderTireCard(t)}</div>)}</div><div className="space-y-3"><h3 className="text-sm font-semibold text-slate-700">Ban Sebelah Kanan</h3>{rightTires.map((t) => <div key={t.id}>{renderTireCard(t)}</div>)}</div></div>
        </section>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end"><button type="button" onClick={() => void saveCompleted()} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-400">{saving ? "Menyimpan..." : "Submit & Selesaikan Backend"}</button></div>
      </div>

      {activePhoto && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setActivePhoto(null)}><div className="max-h-[92vh] max-w-[92vw]" onClick={(e) => e.stopPropagation()}><button type="button" onClick={() => setActivePhoto(null)} className="mb-2 rounded-full bg-black/70 px-3 py-1 text-sm text-white">Tutup</button>{activePhoto.signedUrl && <img src={activePhoto.signedUrl} alt={activePhoto.categoryName} className="max-h-[86vh] max-w-[92vw] rounded-lg object-contain" />}<div className="mt-2 rounded bg-black/60 px-3 py-2 text-center text-xs text-white">{activePhoto.categoryName}</div></div></div>}
    </>
  );
}

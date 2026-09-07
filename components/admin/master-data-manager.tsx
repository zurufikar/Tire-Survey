"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { MASTER_TABLES, VEHICLE_CATEGORY_OPTIONS, type MasterTableKey } from "@/lib/admin-master-data";

export type MasterDataRow = Record<string, unknown> & { id: number; is_active: boolean };
type Row = MasterDataRow;

export function MasterDataManager({
  data,
  provinces,
  tireBrands,
  photoCategories,
}: {
  data: Record<MasterTableKey, Row[]>;
  provinces: { id: number; name: string }[];
  tireBrands: { id: number; name: string }[];
  photoCategories: {
    id: number;
    code: string;
    name: string;
    scope: string;
    is_required: boolean;
    max_photos: number;
  }[];
}) {
  const [active, setActive] = useState<MasterTableKey | "photo_categories">(MASTER_TABLES[0].key);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
        {MASTER_TABLES.map((table) => (
          <button
            key={table.key}
            type="button"
            onClick={() => setActive(table.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active === table.key ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            {table.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setActive("photo_categories")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            active === "photo_categories" ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          Kategori Foto
        </button>
      </div>

      {active === "photo_categories" ? (
        <PhotoCategoriesTable rows={photoCategories} />
      ) : (
        <MasterTableEditor
          key={active}
          table={active}
          rows={data[active]}
          provinces={provinces}
          tireBrands={tireBrands}
        />
      )}
    </div>
  );
}

function PhotoCategoriesTable({
  rows,
}: {
  rows: {
    id: number;
    code: string;
    name: string;
    scope: string;
    is_required: boolean;
    max_photos: number;
  }[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="border-b border-slate-100 p-4">
        <p className="text-sm text-slate-500">
          Kategori foto ditentukan saat migrasi skema (terikat dengan form survey) dan bersifat
          read-only di panel ini.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Kode</th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Wajib</th>
              <th className="px-4 py-3">Maks Foto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.code}</td>
                <td className="px-4 py-3 text-slate-900">{row.name}</td>
                <td className="px-4 py-3 text-slate-700">{row.scope}</td>
                <td className="px-4 py-3 text-slate-700">{row.is_required ? "Ya" : "Tidak"}</td>
                <td className="px-4 py-3 text-slate-700">{row.max_photos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MasterTableEditor({
  table,
  rows,
  provinces,
  tireBrands,
}: {
  table: MasterTableKey;
  rows: Row[];
  provinces: { id: number; name: string }[];
  tireBrands: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const provinceMap = new Map(provinces.map((p) => [p.id, p.name]));
  const tireBrandMap = new Map(tireBrands.map((b) => [b.id, b.name]));

  async function toggleActive(row: Row) {
    setBusyId(row.id);
    setError("");
    try {
      const response = await fetch(`/api/admin/master-data/${table}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, is_active: !row.is_active }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error || "Gagal memperbarui data.");
        return;
      }
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4">
      <AddRowForm table={table} provinces={provinces} tireBrands={tireBrands} onCreated={() => router.refresh()} />

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nama / Detail</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                    Belum ada data.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-slate-900">
                    {rowLabel(table, row, provinceMap, tireBrandMap)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        row.is_active
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                      }`}
                    >
                      {row.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => toggleActive(row)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
                        row.is_active
                          ? "border border-slate-300 text-slate-700 hover:bg-slate-50"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      }`}
                    >
                      {row.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function rowLabel(
  table: MasterTableKey,
  row: Row,
  provinceMap: Map<number, string>,
  tireBrandMap: Map<number, string>,
) {
  switch (table) {
    case "master_cities":
      return `${row.name} — ${provinceMap.get(row.province_id as number) ?? "Provinsi tidak dikenal"}`;
    case "master_tire_sizes":
      return `${row.size}${row.ring_size ? ` (${row.ring_size})` : ""} — ${row.vehicle_category}`;
    case "master_tire_patterns":
      return `${row.pattern} — ${tireBrandMap.get(row.tire_brand_id as number) ?? "Merk tidak dikenal"} (${row.vehicle_category})`;
    default:
      return String(row.name ?? "-");
  }
}

function AddRowForm({
  table,
  provinces,
  tireBrands,
  onCreated,
}: {
  table: MasterTableKey;
  provinces: { id: number; name: string }[];
  tireBrands: { id: number; name: string }[];
  onCreated: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};

    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value.trim()) payload[key] = value;
    }

    if (Object.keys(payload).length === 0) {
      setError("Isi data terlebih dahulu.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/admin/master-data/${table}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error || "Gagal menambah data.");
        return;
      }
      event.currentTarget.reset();
      onCreated();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      {renderFields(table, provinces, tireBrands)}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Menyimpan..." : "Tambah"}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}

function renderFields(
  table: MasterTableKey,
  provinces: { id: number; name: string }[],
  tireBrands: { id: number; name: string }[],
) {
  switch (table) {
    case "master_provinces":
    case "master_vehicle_brands":
    case "master_tire_brands":
      return (
        <Field label="Nama">
          <input name="name" required className="input" placeholder="Nama baru" />
        </Field>
      );
    case "master_cities":
      return (
        <>
          <Field label="Provinsi">
            <select name="province_id" required className="input">
              <option value="">Pilih provinsi</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nama Kota">
            <input name="name" required className="input" placeholder="Nama kota" />
          </Field>
        </>
      );
    case "master_tire_sizes":
      return (
        <>
          <Field label="Kategori">
            <select name="vehicle_category" required className="input">
              {VEHICLE_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ukuran">
            <input name="size" required className="input" placeholder="Contoh: 295/80" />
          </Field>
          <Field label="Ring (opsional)">
            <input name="ring_size" className="input" placeholder="Contoh: R22.5" />
          </Field>
        </>
      );
    case "master_tire_patterns":
      return (
        <>
          <Field label="Kategori">
            <select name="vehicle_category" required className="input">
              {VEHICLE_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Merk Ban">
            <select name="tire_brand_id" required className="input">
              <option value="">Pilih merk</option>
              {tireBrands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pola">
            <input name="pattern" required className="input" placeholder="Nama pola" />
          </Field>
          <Field label="Aplikasi (opsional)">
            <input name="application" className="input" placeholder="Contoh: Highway" />
          </Field>
        </>
      );
    default:
      return null;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[10rem] flex-col gap-1 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

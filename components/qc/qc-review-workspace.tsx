"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Photo = {
  id: string;
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  signedUrl: string | null;
  qcComment?: string;
  createdAt: string;
};

type Tire = {
  id: string;
  position_code: string;
  position_name: string;
  side: "LEFT" | "RIGHT";
  tire_layer: "SINGLE" | "INNER" | "OUTER";
  axle_type: "STEER" | "DRIVE" | "FREE_ROLLING";
  axle_number: number;
  tire_sequence: number;
  supplier_is_retread: boolean | null;
  qcComment: string;
  photos: Photo[];
};

type Survey = {
  id: string;
  serialNumber: string | null;
  surveyDate: string;
  plateNumber: string;
  provinceName: string;
  cityName: string;
  vehicleCategory: string | null;
  segment: string | null;
  busCategory: string | null;
  truckCategory: string | null;
  specificVehicleType: string | null;
  companyName: string | null;
  vehicleBrandName: string;
  cargoType: string | null;
  totalAxles: number | null;
  totalTires: number | null;
  status: string;
  supplierName: string;
  supplierCode: string;
};

type QueueItem = {
  id: string;
  surveyId: string;
  assignmentOrder: number;
  serialNumber: string | null;
  plateNumber: string;
  status: string;
};

type Props = {
  survey: Survey;
  vehiclePhotos: Photo[];
  tires: Tire[];
  latestReview: {
    decision: "PASS" | "DROP" | "PENDING";
    overall_comment: string | null;
    reviewed_at: string | null;
  } | null;
  queue: QueueItem[];
};

type Decision = "PASS" | "REVISION" | "DROP";

function formatValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : value;
}

function vehicleCategoryLabel(value: string | null) {
  if (value === "TB") return "Truck/Bus";
  if (value === "LT") return "Light Truck";
  return formatValue(value);
}

function groupPhotos(photos: Photo[]) {
  const groups = new Map<string, Photo[]>();
  for (const photo of photos) {
    const key = photo.categoryCode || String(photo.categoryId);
    groups.set(key, [...(groups.get(key) ?? []), photo]);
  }
  return [...groups.values()];
}

function PhotoStrip({
  photos,
  onZoom,
}: {
  photos: Photo[];
  onZoom: (photo: Photo) => void;
}) {
  if (photos.length === 0) {
    return <p className="text-xs text-slate-400">Belum ada foto.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {photos.map((photo) => (
        <button
          type="button"
          key={photo.id}
          disabled={!photo.signedUrl}
          onClick={() => onZoom(photo)}
          className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-100 text-left ring-1 ring-slate-200 disabled:cursor-not-allowed"
        >
          {photo.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.signedUrl}
              alt={photo.categoryName}
              className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="flex h-full items-center justify-center p-2 text-center text-xs text-slate-400">
              Foto tidak tersedia
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[10px] font-medium text-white">
            {photo.categoryName}
          </span>
        </button>
      ))}
    </div>
  );
}

export function QcReviewWorkspace({ survey, vehiclePhotos, tires, latestReview, queue }: Props) {
  const router = useRouter();
  const [vehicleComments, setVehicleComments] = useState<Record<string, string>>(
    Object.fromEntries(vehiclePhotos.map((photo) => [photo.id, photo.qcComment ?? ""]))
  );
  const [tireComments, setTireComments] = useState<Record<string, string>>(
    Object.fromEntries(tires.map((tire) => [tire.id, tire.qcComment ?? ""]))
  );
  const [overallComment, setOverallComment] = useState(latestReview?.overall_comment ?? "");
  const [decision, setDecision] = useState<Decision>("PASS");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null);

  const vehicleGroups = useMemo(() => groupPhotos(vehiclePhotos), [vehiclePhotos]);
  const leftTires = tires.filter((tire) => tire.side === "LEFT");
  const rightTires = tires.filter((tire) => tire.side === "RIGHT");

  const isReadonly = survey.status !== "SUBMITTED" && survey.status !== "QC_REVIEW";

  async function submitDecision() {
    setSaving(true);
    setError(null);

    if (decision === "REVISION" && !overallComment.trim()) {
      setError("Catatan keseluruhan wajib diisi ketika QC meminta revisi.");
      setSaving(false);
      return;
    }

    const payload = {
      decision,
      overallComment,
      vehicleComments: vehiclePhotos.map((photo) => ({
        photo_id: photo.id,
        comment: vehicleComments[photo.id] ?? "",
      })),
      tireComments: tires.map((tire) => ({
        tire_id: tire.id,
        comment: tireComments[tire.id] ?? "",
      })),
    };

    try {
      const response = await fetch(`/api/qc/${survey.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Gagal menyimpan hasil QC.");
      }

      router.push("/qc");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Gagal menyimpan hasil QC.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">Queue QC</h2>
                <p className="mt-1 text-xs text-slate-500">Assignment akun ini</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{queue.length}</span>
            </div>
            <div className="mt-3 max-h-[44vh] space-y-2 overflow-y-auto pr-1">
              {queue.map((item) => {
                const isCurrent = item.surveyId === survey.id;
                const pending = item.status === "SUBMITTED" || item.status === "QC_REVIEW";
                return (
                  <a
                    key={item.id}
                    href={`/qc/${item.surveyId}`}
                    className={`block rounded-lg border px-3 py-2 transition ${isCurrent ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] text-slate-500">#{item.assignmentOrder}</p>
                        <p className="truncate text-sm font-medium text-slate-900">{item.serialNumber ?? "Tanpa Serial"}</p>
                        <p className="truncate text-xs text-slate-500">{item.plateNumber || "-"}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${pending ? "bg-amber-50 text-amber-700" : item.status === "QC_PASSED" ? "bg-emerald-50 text-emerald-700" : item.status === "QC_DROPPED" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                        {pending ? "Pending" : item.status === "QC_PASSED" ? "Pass" : item.status === "QC_DROPPED" ? "Drop" : item.status}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <h2 className="font-semibold text-slate-900">Konteks Survey</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Serial Number</dt>
                <dd className="font-semibold text-slate-900">{formatValue(survey.serialNumber)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Data Supplier</dt>
                <dd className="font-medium text-slate-800">{survey.supplierName}</dd>
                <dd className="text-xs text-slate-500">{survey.supplierCode}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Plat Nomor</dt>
                <dd className="font-medium text-slate-800">{formatValue(survey.plateNumber)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Lokasi</dt>
                <dd className="font-medium text-slate-800">{survey.cityName}, {survey.provinceName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Kendaraan</dt>
                <dd className="font-medium text-slate-800">{survey.vehicleBrandName} · {vehicleCategoryLabel(survey.vehicleCategory)}</dd>
                <dd className="text-xs text-slate-500">{formatValue(survey.segment)} / {formatValue(survey.busCategory ?? survey.truckCategory)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Total</dt>
                <dd className="font-medium text-slate-800">{formatValue(survey.totalAxles)} poros · {formatValue(survey.totalTires)} ban</dd>
              </div>
            </dl>
          </section>
        </aside>

        <section className="space-y-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Bukti Kendaraan</h2>
                <p className="mt-1 text-sm text-slate-500">Semua foto yang diunggah Supplier ditampilkan untuk QC.</p>
              </div>
              <span className="text-xs text-slate-500">Klik foto untuk zoom</span>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {vehicleGroups.map((photos) => {
                const firstPhoto = photos[0];
                const label = firstPhoto?.categoryName ?? "Foto Kendaraan";
                const firstId = firstPhoto?.id ?? "vehicle-photo-group";
                return (
                  <article key={firstId} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium text-slate-800">{label}</h3>
                      <span className="text-xs text-slate-500">{photos.length} foto</span>
                    </div>
                    <div className="mt-3">
                      <PhotoStrip photos={photos} onZoom={setActivePhoto} />
                    </div>
                    <label className="mt-3 block">
                      <span className="mb-1 block text-xs font-medium text-slate-600">Komentar QC</span>
                      <textarea
                        value={vehicleComments[firstId] ?? ""}
                        onChange={(event) =>
                          setVehicleComments((current) => ({
                            ...current,
                            [firstId]: event.target.value,
                          }))
                        }
                        disabled={isReadonly}
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 disabled:bg-slate-50"
                        placeholder="Catatan untuk foto kendaraan ini..."
                      />
                    </label>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Bukti Ban</h2>
                <p className="mt-1 text-sm text-slate-500">Posisi kiri dan kanan dipertahankan sesuai konfigurasi Supplier.</p>
              </div>
              <span className="text-xs text-slate-500">Total {tires.length} posisi</span>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {[
                ["Kiri", leftTires],
                ["Kanan", rightTires],
              ].map(([sideLabel, sideTires]) => (
                <div key={sideLabel as string} className="space-y-3">
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                    Ban {sideLabel as string} · {(sideTires as Tire[]).length} posisi
                  </div>
                  {(sideTires as Tire[]).map((tire) => (
                    <article key={tire.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-medium text-slate-900">{tire.position_name}</h3>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {tire.axle_type} · Poros {tire.axle_number} · {tire.tire_layer}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                          Vulkanisir: {tire.supplier_is_retread === null ? "-" : tire.supplier_is_retread ? "Y" : "N"}
                        </span>
                      </div>

                      <div className="mt-3">
                        <PhotoStrip photos={tire.photos} onZoom={setActivePhoto} />
                      </div>

                      <label className="mt-3 block">
                        <span className="mb-1 block text-xs font-medium text-slate-600">Komentar Posisi Ban</span>
                        <textarea
                          value={tireComments[tire.id] ?? ""}
                          onChange={(event) =>
                            setTireComments((current) => ({
                              ...current,
                              [tire.id]: event.target.value,
                            }))
                          }
                          disabled={isReadonly}
                          rows={2}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 disabled:bg-slate-50"
                          placeholder="Catatan QC untuk posisi ini..."
                        />
                      </label>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Hasil QC</h2>
              <p className="mt-1 text-sm text-slate-500">
                Pass meneruskan survey ke Backend; Revision mengembalikan ke Supplier; Drop mengakhiri survey sebagai QC_DROPPED.
              </p>
            </div>

            {latestReview && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                Review terakhir: <strong>{latestReview.decision}</strong>
                {latestReview.reviewed_at ? ` · ${new Date(latestReview.reviewed_at).toLocaleString("id-ID")}` : ""}
              </div>
            )}

            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Catatan keseluruhan QC</span>
              <textarea
                value={overallComment}
                onChange={(event) => setOverallComment(event.target.value)}
                disabled={isReadonly}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 disabled:bg-slate-50"
                placeholder="Tuliskan kesimpulan QC..."
              />
            </label>

            <div className="mt-4 rounded-xl border border-slate-200 p-3">
              <label className="block text-sm font-medium text-slate-700">Status Data</label>
              <select
                value={decision}
                onChange={(event) => setDecision(event.target.value as Decision)}
                disabled={isReadonly || saving}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2 md:max-w-sm disabled:bg-slate-50"
              >
                <option value="PASS">Pass QC</option>
                <option value="REVISION">Revision ke Supplier</option>
                <option value="DROP">Drop QC</option>
              </select>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => router.push("/qc")}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={submitDecision}
                disabled={isReadonly || saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {saving ? "Menyimpan..." : "Simpan Hasil QC"}
              </button>
            </div>
          </section>
        </section>
      </div>

      {activePhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${activePhoto.categoryName}`}
          onClick={() => setActivePhoto(null)}
        >
          <div className="relative max-h-[92vh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setActivePhoto(null)}
              className="absolute right-2 top-2 rounded-full bg-black/65 px-3 py-1 text-sm text-white hover:bg-black/80"
            >
              Tutup
            </button>
            {activePhoto.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activePhoto.signedUrl}
                alt={activePhoto.categoryName}
                className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain"
              />
            ) : (
              <div className="rounded-lg bg-white px-6 py-10 text-sm text-slate-600">Foto tidak tersedia.</div>
            )}
            <div className="mt-2 rounded bg-black/60 px-3 py-2 text-center text-xs text-white">
              {activePhoto.categoryName}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

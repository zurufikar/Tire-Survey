"use client";

import { useState } from "react";

type Photo = {
  id: string;
  categoryName: string;
  signedUrl: string | null;
};

type VehiclePhoto = Photo;

type Tire = {
  id: string;
  positionName: string;
  side: "LEFT" | "RIGHT";
  supplierIsRetread: boolean | null;
  qcComment: string;
  photos: Photo[];
};

type Review = {
  id: string;
  decision: string;
  overallComment: string | null;
  reviewedAt: string | null;
};

type Props = {
  vehiclePhotos: VehiclePhoto[];
  leftTires: Tire[];
  rightTires: Tire[];
  reviews: Review[];
};

function PhotoGrid({ photos, onZoom, showComments = false }: {
  photos: Array<Photo & { qcComment?: string }>;
  onZoom: (photo: Photo) => void;
  showComments?: boolean;
}) {
  if (photos.length === 0) {
    return <p className="text-sm text-slate-400">Belum ada foto.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => (
        <div key={photo.id}>
          <button
            type="button"
            disabled={!photo.signedUrl}
            onClick={() => onZoom(photo)}
            className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 disabled:cursor-not-allowed"
          >
            {photo.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.signedUrl}
                alt={photo.categoryName}
                className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.03]"
              />
            ) : (
              <span className="flex h-full items-center justify-center p-2 text-xs text-slate-400">
                Foto tidak tersedia
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-left text-[11px] font-medium text-white">
              {photo.categoryName}
            </span>
          </button>
          {showComments && photo.qcComment && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
              <p className="text-[11px] font-semibold text-amber-800">Komentar QC</p>
              <p className="mt-0.5 whitespace-pre-wrap text-xs text-amber-900">{photo.qcComment}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TireColumn({ title, tires, onZoom }: { title: string; tires: Tire[]; onZoom: (photo: Photo) => void }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="space-y-3">
        {tires.map((tire) => (
          <article key={tire.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <h4 className="font-semibold text-slate-900">{tire.positionName}</h4>
              <span className="inline-flex w-fit rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                Vulkanisir: {tire.supplierIsRetread == null ? "-" : tire.supplierIsRetread ? "Y" : "N"}
              </span>
            </div>
            <div className="mt-3">
              <PhotoGrid photos={tire.photos} onZoom={onZoom} />
            </div>
            {tire.qcComment && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800">Komentar QC</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{tire.qcComment}</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

export function SupplierSurveyReview({ vehiclePhotos, leftTires, rightTires, reviews }: Props) {
  const [activePhoto, setActivePhoto] = useState<Photo | null>(null);

  return (
    <>
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div>
          <h2 className="font-semibold text-slate-900">Bukti Foto Survey</h2>
          <p className="mt-1 text-sm text-slate-500">Foto yang sudah dikirim dapat dilihat kembali oleh Supplier untuk verifikasi hasil survey.</p>
        </div>

        <div className="mt-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Foto Kendaraan</h3>
          <PhotoGrid photos={vehiclePhotos} onZoom={setActivePhoto} showComments />
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <TireColumn title="Ban Sebelah Kiri" tires={leftTires} onZoom={setActivePhoto} />
          <TireColumn title="Ban Sebelah Kanan" tires={rightTires} onZoom={setActivePhoto} />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div>
          <h2 className="font-semibold text-slate-900">Riwayat & Hasil QC</h2>
          <p className="mt-1 text-sm text-slate-500">Hasil QC bersifat read-only dan dapat digunakan untuk verifikasi atau pengajuan banding.</p>
        </div>

        {reviews.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">Belum ada hasil review QC.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {reviews.map((review, index) => (
              <article key={review.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">Review QC #{reviews.length - index}</span>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">{review.decision}</span>
                  </div>
                  {review.reviewedAt && (
                    <span className="text-xs text-slate-500">{new Date(review.reviewedAt).toLocaleString("id-ID")}</span>
                  )}
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-600">Catatan keseluruhan QC</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{review.overallComment?.trim() || "Tidak ada catatan keseluruhan."}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {activePhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setActivePhoto(null)}
        >
          <div className="relative max-h-[92vh] max-w-[92vw]" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setActivePhoto(null)}
              className="absolute right-2 top-2 rounded-full bg-black/65 px-3 py-1 text-sm text-white"
            >
              Tutup
            </button>
            {activePhoto.signedUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activePhoto.signedUrl}
                alt={activePhoto.categoryName}
                className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain"
              />
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

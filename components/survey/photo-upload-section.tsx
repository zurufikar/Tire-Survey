"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TirePosition = {
  id?: string;
  axle_type: "STEER" | "DRIVE" | "FREE_ROLLING";
  axle_number: number;
  position_code: string;
  position_name: string;
  side: "LEFT" | "RIGHT";
  tire_sequence: number;
};

type PhotoCategory = {
  id: number;
  code: string;
  name: string;
  scope: "VEHICLE" | "TIRE";
  is_required: boolean;
  max_photos: number;
  sort_order: number;
};

type PhotoItem = {
  id: string;
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  signedUrl: string | null;
  previewUrl?: string;
  storagePath?: string;
  uploadState?: "uploading" | "saved";
  createdAt: string;
  tirePositionId?: string;
  positionName?: string;
  positionCode?: string;
  side?: "LEFT" | "RIGHT" | "";
};

type AxleConfig = {
  axle_type: "STEER" | "DRIVE" | "FREE_ROLLING";
  axle_count: number;
  tire_configuration: "SINGLE" | "DOUBLE";
};

type Props = {
  surveyId: string;
  tirePositions: TirePosition[];
  axleConfigs: AxleConfig[];
};

const VEHICLE_CODES = ["FRONT_VIEW", "REAR_VIEW", "SIDE_VIEW"] as const;
const MAX_TIRE_PHOTOS = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function vehicleLabel(code: (typeof VEHICLE_CODES)[number]) {
  switch (code) {
    case "FRONT_VIEW":
      return "Tampak Depan";
    case "REAR_VIEW":
      return "Tampak Belakang";
    case "SIDE_VIEW":
      return "Tampak Samping";
  }
}

export function PhotoUploadSection({ surveyId, tirePositions, axleConfigs }: Props) {
  // M2 hardening: previews are local-first; network state never controls whether a selected file appears.
  const [categories, setCategories] = useState<PhotoCategory[]>([]);
  const [vehiclePhotos, setVehiclePhotos] = useState<PhotoItem[]>([]);
  const [tirePhotos, setTirePhotos] = useState<PhotoItem[]>([]);
  const [selectedTireCategory, setSelectedTireCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploadingKey, setUploadingKey] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const vehicleInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const tireInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const previewUrlsRef = useRef(new Set<string>());

  const [viewer, setViewer] = useState<{
    url: string;
    label: string;
    scale: number;
  } | null>(null);

  const vehicleCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.scope === "VEHICLE" &&
          VEHICLE_CODES.includes(
            category.code as (typeof VEHICLE_CODES)[number]
          )
      ),
    [categories]
  );

  const tireCategories = useMemo(
    () => categories.filter((category) => category.scope === "TIRE"),
    [categories]
  );

  const leftPositions = useMemo(
    () =>
      tirePositions
        .filter((position) => position.side === "LEFT")
        .sort((a, b) => a.tire_sequence - b.tire_sequence),
    [tirePositions]
  );

  const rightPositions = useMemo(
    () =>
      tirePositions
        .filter((position) => position.side === "RIGHT")
        .sort((a, b) => a.tire_sequence - b.tire_sequence),
    [tirePositions]
  );

  async function loadPhotos(options?: { showLoading?: boolean }) {
    const showLoading = options?.showLoading ?? false;
    if (showLoading) {
      setLoading(true);
    }
    setError("");

    try {
      const response = await fetch(
        `/api/surveys/${surveyId}/photos`,
        { cache: "no-store" }
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Foto gagal dimuat.");
      }

      setCategories(payload.categories ?? []);
      setVehiclePhotos(payload.vehiclePhotos ?? []);
      setTirePhotos(payload.tirePhotos ?? []);

      if (!selectedTireCategory && payload.categories) {
        const firstTireCategory = payload.categories.find(
          (category: PhotoCategory) => category.scope === "TIRE"
        );
        if (firstTireCategory) {
          setSelectedTireCategory(String(firstTireCategory.id));
        }
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Foto gagal dimuat."
      );
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadPhotos({ showLoading: true });
  }, [surveyId]);

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      previewUrlsRef.current.clear();
    };
  }, []);

  async function uploadFiles(
    files: File[] | null,
    scope: "VEHICLE" | "TIRE",
    categoryId: number,
    tirePositionId?: string,
    tirePositionCode?: string
  ) {
    if (!files || files.length === 0) return;

    // Snapshot the FileList before clearing the <input>. A FileList can be live,
    // so clearing input.value first can make it appear empty.
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      if (!ALLOWED_TYPES.has(file.type)) {
        setError("Format foto harus JPG, PNG, atau WebP.");
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError("Ukuran setiap foto maksimal 10 MB.");
        return;
      }
    }

    const targetPosition =
      scope === "TIRE"
        ? tirePositions.find(
            (position) =>
              (tirePositionId && position.id === tirePositionId) ||
              (!tirePositionId &&
                tirePositionCode &&
                position.position_code === tirePositionCode)
          )
        : undefined;

    const category =
      vehicleCategories.find((item) => item.id === categoryId) ??
      tireCategories.find((item) => item.id === categoryId);

    if (!category) {
      setError("Kategori foto tidak ditemukan.");
      return;
    }

    const existingCount =
      scope === "VEHICLE"
        ? vehiclePhotos.filter((photo) => photo.categoryId === categoryId).length
        : tirePhotos.filter(
            (photo) =>
              (tirePositionId && photo.tirePositionId === tirePositionId) ||
              (!tirePositionId &&
                tirePositionCode &&
                photo.positionCode === tirePositionCode)
          ).length;

    const maxPhotos =
      scope === "VEHICLE"
        ? Math.min(category.max_photos || MAX_TIRE_PHOTOS, MAX_TIRE_PHOTOS)
        : MAX_TIRE_PHOTOS;

    if (existingCount + fileArray.length > maxPhotos) {
      setError(`Maksimal ${maxPhotos} foto untuk ${scope === "VEHICLE" ? "kategori ini" : "satu posisi ban"}.`);
      return;
    }

    if (scope === "TIRE" && !targetPosition) {
      setError("Posisi ban tidak ditemukan.");
      return;
    }

    const uploadKey = `${scope}:${tirePositionCode ?? categoryId}`;
    setUploadingKey(uploadKey);
    setError("");

    const optimisticIds: string[] = [];
    const optimisticPreviews = new Map<string, string>();
    const savedOptimisticIds = new Set<string>();
    const optimisticPhotos: PhotoItem[] = [];

    // IMPORTANT: Put the local preview into React state BEFORE any network/auth call.
    // Selecting a photo must immediately change 0/10 -> 1/10 and show the thumbnail.
    for (const file of fileArray) {
      const extension =
        file.type === "image/jpeg"
          ? "jpg"
          : file.type === "image/png"
            ? "png"
            : "webp";

      const folder =
        scope === "VEHICLE"
          ? `vehicle/${(category?.code ?? "PHOTO")}`
          : `tire/${targetPosition!.position_code}`;

      const storagePath = `${surveyId}/${folder}/${crypto.randomUUID()}.${extension}`;
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      const tempId = `local-${crypto.randomUUID()}`;
      optimisticIds.push(tempId);
      optimisticPreviews.set(tempId, previewUrl);

      const optimisticPhoto: PhotoItem = {
        id: tempId,
        categoryId,
        categoryCode: category?.code ?? "",
        categoryName: category?.name ?? "Foto",
        signedUrl: null,
        previewUrl,
        storagePath,
        uploadState: "uploading",
        createdAt: new Date().toISOString(),
        ...(scope === "TIRE"
          ? {
              tirePositionId: targetPosition?.id,
              positionName: targetPosition?.position_name,
              positionCode: targetPosition?.position_code,
              side: targetPosition?.side,
            }
          : {}),
      };

      optimisticPhotos.push(optimisticPhoto);
    }

    if (scope === "VEHICLE") {
      setVehiclePhotos((current) => [...current, ...optimisticPhotos]);
    } else {
      setTirePhotos((current) => [...current, ...optimisticPhotos]);
    }

    const supabase = createClient();

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) {
        throw new Error("Sesi login tidak tersedia. Silakan login ulang.");
      }

      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!baseUrl || !apiKey) {
        throw new Error("Konfigurasi Supabase di browser belum lengkap.");
      }

      for (let index = 0; index < fileArray.length; index += 1) {
        const file = fileArray[index];
        const optimisticPhoto = optimisticPhotos[index];
        const tempId = optimisticPhoto.id;
        const previewUrl = optimisticPhoto.previewUrl!;
        const storagePath = optimisticPhoto.storagePath!;

        const storageUrl = `${baseUrl.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent("survey-photos")}/${storagePath
          .split("/")
          .map((part) => encodeURIComponent(part))
          .join("/")}`;

        let response: Response;
        try {
          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => controller.abort(), 60_000);
          try {
            response = await fetch(storageUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                apikey: apiKey,
                "Content-Type": file.type,
                "x-upsert": "false",
              },
              body: file,
              signal: controller.signal,
            });
          } finally {
            window.clearTimeout(timeoutId);
          }
        } catch (storageFetchError) {
          if (storageFetchError instanceof DOMException && storageFetchError.name === "AbortError") {
            throw new Error("Upload Storage timeout setelah 60 detik.");
          }
          throw new Error(
            storageFetchError instanceof Error
              ? `Upload Storage gagal: ${storageFetchError.message}`
              : "Upload Storage gagal."
          );
        }

        const responseText = await response.text();
        if (!response.ok) {
          let detail = responseText;
          try {
            const parsed = JSON.parse(responseText) as {
              message?: string;
              error?: string;
              statusCode?: string;
            };
            detail = parsed.message ?? parsed.error ?? parsed.statusCode ?? responseText;
          } catch {
            // Keep plain-text response when it is not JSON.
          }
          throw new Error(
            `Upload Storage gagal (${response.status}): ${detail || response.statusText}`
          );
        }

        const metadataController = new AbortController();
        const metadataTimeoutId = window.setTimeout(
          () => metadataController.abort(),
          30_000
        );

        let metadataResponse: Response;
        try {
          metadataResponse = await fetch(`/api/surveys/${surveyId}/photos`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              scope,
              category_id: categoryId,
              storage_path: storagePath,
              tire_position_id: tirePositionId ?? null,
              position_code: targetPosition?.position_code ?? null,
              axle_configs: scope === "TIRE" ? axleConfigs : null,
            }),
            signal: metadataController.signal,
          });
        } catch (metadataFetchError) {
          if (metadataFetchError instanceof DOMException && metadataFetchError.name === "AbortError") {
            throw new Error("Penyimpanan metadata foto timeout setelah 30 detik.");
          }
          throw new Error(
            metadataFetchError instanceof Error
              ? `Metadata foto gagal: ${metadataFetchError.message}`
              : "Metadata foto gagal."
          );
        } finally {
          window.clearTimeout(metadataTimeoutId);
        }

        const metadataPayload = await metadataResponse.json();

        if (!metadataResponse.ok || !metadataPayload.photo) {
          await supabase.storage.from("survey-photos").remove([storagePath]);
          throw new Error(
            metadataPayload.error ?? "Metadata foto gagal disimpan."
          );
        }

        const savedPhoto = {
          ...metadataPayload.photo,
          previewUrl,
          uploadState: "saved" as const,
        } as PhotoItem;
        savedOptimisticIds.add(tempId);

        if (scope === "VEHICLE") {
          setVehiclePhotos((current) =>
            current.map((photo) => (photo.id === tempId ? savedPhoto : photo))
          );
        } else {
          setTirePhotos((current) =>
            current.map((photo) => (photo.id === tempId ? savedPhoto : photo))
          );
        }
      }
    } catch (uploadError) {
      // Remove only still-optimistic rows. Already-saved rows from earlier files stay visible.
      setVehiclePhotos((current) =>
        current.filter((photo) => !optimisticIds.includes(photo.id))
      );
      setTirePhotos((current) =>
        current.filter((photo) => !optimisticIds.includes(photo.id))
      );

      for (const [tempId, previewUrl] of optimisticPreviews.entries()) {
        if (!savedOptimisticIds.has(tempId)) {
          URL.revokeObjectURL(previewUrl);
          previewUrlsRef.current.delete(previewUrl);
        }
      }

      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Foto gagal diupload."
      );
    } finally {
      setUploadingKey("");
    }
  }

  async function deletePhoto(photoId: string) {
    setDeletingId(photoId);
    setError("");

    try {
      const response = await fetch(`/api/surveys/${surveyId}/photos`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ photo_id: photoId }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Foto gagal dihapus.");
      }

      const removedPhoto =
        vehiclePhotos.find((photo) => photo.id === photoId) ??
        tirePhotos.find((photo) => photo.id === photoId);

      setVehiclePhotos((current) =>
        current.filter((photo) => photo.id !== photoId)
      );
      setTirePhotos((current) =>
        current.filter((photo) => photo.id !== photoId)
      );

      if (removedPhoto?.previewUrl) {
        URL.revokeObjectURL(removedPhoto.previewUrl);
        previewUrlsRef.current.delete(removedPhoto.previewUrl);
      }

      if (payload.storagePath) {
        const supabase = createClient();
        const { error: storageError } = await supabase.storage
          .from("survey-photos")
          .remove([payload.storagePath]);

        if (storageError) {
          setError(
            `Metadata foto sudah dihapus, tetapi file Storage belum terhapus: ${storageError.message}`
          );
        }
      }
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Foto gagal dihapus."
      );
    } finally {
      setDeletingId("");
    }
  }

  function openViewer(photo: PhotoItem, label: string) {
    const url = photo.previewUrl ?? photo.signedUrl;
    if (!url) return;
    setViewer({
      url,
      label,
      scale: 1,
    });
  }

  function renderPhotoStrip(
    photos: PhotoItem[],
    positionLabel: string,
  ) {
    if (photos.length === 0) {
      return (
        <p className="text-xs text-slate-400">
          Belum ada foto.
        </p>
      );
    }

    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
          >
            {photo.previewUrl || photo.signedUrl ? (
              <button
                type="button"
                className="block h-20 w-20 overflow-hidden"
                onClick={() => openViewer(photo, positionLabel)}
                aria-label={`Lihat ${positionLabel}`}
              >
                <img
                  src={photo.previewUrl ?? photo.signedUrl!}
                  alt={positionLabel}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
            ) : (
              <div className="flex h-20 w-20 items-center justify-center text-[10px] text-slate-400">
                Preview tidak tersedia
              </div>
            )}

            {photo.uploadState === "uploading" ? (
              <span className="absolute inset-x-1 bottom-1 rounded bg-slate-900/80 px-1 py-0.5 text-center text-[9px] font-medium text-white">
                Mengupload...
              </span>
            ) : null}

            {scopeBadge(photo)}

            <button
              type="button"
              className="absolute right-1 top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow disabled:opacity-50"
              onClick={() => void deletePhoto(photo.id)}
              disabled={deletingId === photo.id || uploadingKey !== ""}
              aria-label="Hapus foto"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
  }

  function scopeBadge(photo: PhotoItem) {
    return (
      <span className="absolute bottom-1 left-1 max-w-[68px] truncate rounded bg-white/90 px-1 py-0.5 text-[9px] font-medium text-slate-700 shadow">
        {photo.categoryName}
      </span>
    );
  }

  function renderVehicleSlot(code: (typeof VEHICLE_CODES)[number]) {
    const category = vehicleCategories.find((item) => item.code === code);
    const photos = vehiclePhotos.filter(
      (photo) => photo.categoryCode === code
    );
    const uploadKey = `VEHICLE:${category?.id ?? code}`;

    return (
      <div
        key={code}
        className="rounded-lg border border-slate-200 bg-white p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-800">
              {vehicleLabel(code)}
            </div>
            <div className="text-xs text-slate-500">
              {photos.length}/{Math.min(category?.max_photos || MAX_TIRE_PHOTOS, MAX_TIRE_PHOTOS)} foto
            </div>
          </div>

          {photos.length === 0 ? (
            <span className="text-xs font-semibold text-red-600">
              Wajib
            </span>
          ) : (
            <span className="text-xs font-semibold text-green-600">
              Lengkap
            </span>
          )}
        </div>

        {category ? (
          <div className="mt-3">
            <input
              ref={(element) => {
                vehicleInputRefs.current[code] = element;
              }}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              disabled={uploadingKey !== ""}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const files = event.currentTarget.files
                  ? Array.from(event.currentTarget.files)
                  : [];
                event.currentTarget.value = "";
                void uploadFiles(files, "VEHICLE", category.id);
              }}
            />
            <button
              type="button"
              disabled={uploadingKey !== ""}
              onClick={() => vehicleInputRefs.current[code]?.click()}
              className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="font-medium">{uploadingKey === uploadKey ? "Mengupload..." : "Tambah foto"}</span>
              <span className="ml-1 text-slate-400">(klik untuk pilih foto)</span>
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs text-red-600">
            Master kategori {code} belum tersedia.
          </p>
        )}

        {renderPhotoStrip(photos, vehicleLabel(code))}
      </div>
    );
  }

  function renderTirePosition(position: TirePosition) {
    const photos = tirePhotos.filter(
      (photo) =>
        (position.id && photo.tirePositionId === position.id) ||
        (!position.id && photo.positionCode === position.position_code)
    );
    const uploadKey = `TIRE:${position.id ?? position.position_code}`;
    const complete = photos.length > 0;

    return (
      <div
        key={position.id ?? position.position_code}
        className="rounded-lg border border-slate-200 bg-white p-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-800">
              {position.position_name}
            </div>
            <div className="text-xs text-slate-500">
              {photos.length}/{MAX_TIRE_PHOTOS} foto
            </div>
          </div>

          <span
            className={
              complete
                ? "text-xs font-semibold text-green-600"
                : "text-xs font-semibold text-red-600"
            }
          >
            {complete ? "Lengkap" : "Wajib 1 foto"}
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <select
            value={selectedTireCategory}
            onChange={(event) => setSelectedTireCategory(event.target.value)}
            className="input"
            disabled={tireCategories.length === 0}
          >
            <option value="">Pilih jenis foto</option>
            {tireCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <div>
            <input
              ref={(element) => {
                tireInputRefs.current[position.position_code] = element;
              }}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              disabled={
                !selectedTireCategory ||
                uploadingKey !== "" ||
                photos.length >= MAX_TIRE_PHOTOS
              }
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const files = event.currentTarget.files
                  ? Array.from(event.currentTarget.files)
                  : [];
                event.currentTarget.value = "";

                if (!selectedTireCategory) {
                  setError("Pilih jenis foto terlebih dahulu.");
                  return;
                }

                void uploadFiles(
                  files,
                  "TIRE",
                  Number(selectedTireCategory),
                  position.id,
                  position.position_code
                );
              }}
            />
            <button
              type="button"
              disabled={
                !selectedTireCategory ||
                uploadingKey !== "" ||
                photos.length >= MAX_TIRE_PHOTOS
              }
              onClick={() => {
                if (!selectedTireCategory) {
                  setError("Pilih jenis foto terlebih dahulu.");
                  return;
                }
                tireInputRefs.current[position.position_code]?.click();
              }}
              className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploadingKey === uploadKey ? "Mengupload..." : "Tambah Foto"}
            </button>
          </div>
        </div>

        {renderPhotoStrip(photos, position.position_name)}
      </div>
    );
  }

  if (loading) {
    return (
      <section className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <div className="text-sm text-slate-500">
          Memuat foto survey...
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="flex flex-col gap-1 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest text-blue-600">
            SECTION 04
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            Upload Foto Kendaraan & Posisi Ban
          </h2>
        </div>
        <div className="text-xs text-slate-500">
          Format JPG/PNG/WebP · Maks. 10 MB/foto
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-3">
        <div className="mb-2 text-sm font-semibold text-slate-800">
          Foto Kendaraan
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {VEHICLE_CODES.map(renderVehicleSlot)}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-800">
              Posisi Ban Otomatis
            </div>
            <div className="text-xs text-slate-500">
              Minimal 1 foto per posisi, maksimal 10 foto.
            </div>
          </div>
          <div className="text-xs font-semibold text-slate-600">
            {tirePositions.length} posisi
          </div>
        </div>

        {tirePositions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
            Atur konfigurasi poros pada Section 03 untuk menampilkan posisi ban.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Sisi Kiri
              </div>
              <div className="space-y-3">
                {leftPositions.map(renderTirePosition)}
              </div>
            </div>

            <div>
              <div className="mb-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Sisi Kanan
              </div>
              <div className="space-y-3">
                {rightPositions.map(renderTirePosition)}
              </div>
            </div>
          </div>
        )}
      </div>

      {viewer ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${viewer.label}`}
          onClick={() => setViewer(null)}
        >
          <div
            className="flex max-h-[95vh] max-w-[95vw] flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
              <div className="truncate text-sm font-semibold text-slate-800">
                {viewer.label}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setViewer((current) =>
                      current
                        ? {
                            ...current,
                            scale: Math.max(0.5, current.scale - 0.25),
                          }
                        : current
                    )
                  }
                  className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700 hover:bg-slate-200"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setViewer((current) =>
                      current
                        ? {
                            ...current,
                            scale: Math.min(3, current.scale + 0.25),
                          }
                        : current
                    )
                  }
                  className="rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-700 hover:bg-slate-200"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setViewer(null)}
                  className="rounded-md bg-slate-900 px-2 py-1 text-sm text-white"
                >
                  Tutup
                </button>
              </div>
            </div>

            <div className="max-h-[85vh] max-w-[95vw] overflow-auto bg-slate-950 p-4">
              <img
                src={viewer.url}
                alt={viewer.label}
                style={{ transform: `scale(${viewer.scale})` }}
                className="mx-auto max-h-[78vh] max-w-full origin-center object-contain transition-transform"
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

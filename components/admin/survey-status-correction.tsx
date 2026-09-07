"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_OPTIONS = [
  "DRAFT",
  "SUBMITTED",
  "QC_REVIEW",
  "QC_REVISION",
  "QC_PASSED",
  "QC_DROPPED",
  "BACKEND_REVIEW",
  "BACKEND_REVISION",
  "COMPLETED",
] as const;

export function SurveyStatusCorrection({
  surveyId,
  currentStatus,
}: {
  surveyId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDone(false);

    if (status === currentStatus) {
      setError("Pilih status baru terlebih dahulu.");
      return;
    }
    if (!reason.trim()) {
      setError("Alasan koreksi wajib diisi untuk audit log.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/admin/surveys/${surveyId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason: reason.trim() }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error || "Koreksi status gagal.");
        return;
      }
      setDone(true);
      setReason("");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-amber-300">
      <div className="mb-4">
        <p className="text-sm font-medium text-amber-700">Superadmin</p>
        <h2 className="mt-1 font-semibold text-slate-900">Koreksi Status Manual</h2>
        <p className="mt-1 text-sm text-slate-500">
          Mengubah status survey langsung, di luar alur QC/Backend normal.
          Setiap koreksi dicatat di audit log beserta alasannya.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <div>
          <label htmlFor="status" className="mb-1 block text-sm font-medium text-slate-700">
            Status baru
          </label>
          <select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="input"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="reason" className="mb-1 block text-sm font-medium text-slate-700">
            Alasan (wajib)
          </label>
          <input
            id="reason"
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Contoh: survey salah kirim ke QC, dikembalikan ke draft atas permintaan supplier"
            className="input"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="h-fit rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Menyimpan..." : "Terapkan"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {done && !error && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Status diperbarui.
        </p>
      )}
    </section>
  );
}

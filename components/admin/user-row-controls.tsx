"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AppRole = "supplier" | "qc_backend" | "pm_pic" | "superadmin";

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "supplier", label: "Supplier" },
  { value: "qc_backend", label: "QC / Backend" },
  { value: "pm_pic", label: "PM / PIC" },
  { value: "superadmin", label: "Superadmin" },
];

export function UserRowControls({
  userId,
  role,
  isActive,
  isSelf,
}: {
  userId: string;
  role: AppRole;
  isActive: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error || "Gagal memperbarui pengguna.");
        return;
      }
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setBusy(false);
    }
  }

  if (isSelf) {
    return <span className="text-xs text-slate-400">Akun Anda</span>;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <select
        value={role}
        disabled={busy}
        onChange={(event) => patch({ role: event.target.value })}
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-60"
      >
        {ROLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={() => patch({ isActive: !isActive })}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
          isActive
            ? "border border-slate-300 text-slate-700 hover:bg-slate-50"
            : "bg-emerald-600 text-white hover:bg-emerald-700"
        }`}
      >
        {isActive ? "Nonaktifkan" : "Aktifkan"}
      </button>
    </div>
  );
}

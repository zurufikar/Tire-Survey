"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewSurveyButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function createSurvey() {
    if (creating) return;

    setCreating(true);
    setError("");

    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const payload = await response.json();

      if (!response.ok || !payload?.data?.id) {
        throw new Error(payload?.error ?? "Draft survey gagal dibuat.");
      }

      router.push(`/survey/${payload.data.id}/edit`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Draft survey gagal dibuat.",
      );
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void createSurvey()}
        disabled={creating}
        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {creating ? "Membuat Draft..." : "+ Survey Baru"}
      </button>
      {error ? (
        <p className="max-w-xs text-right text-xs text-red-600">{error}</p>
      ) : null}
    </div>
  );
}

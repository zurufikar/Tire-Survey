"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewSurveyButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createDraft() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/surveys/draft", {
        method: "POST",
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Gagal membuat draft survey.");
      }

      router.push(`/survey/${payload.data.id}/edit`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Gagal membuat draft survey."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={createDraft}
        disabled={loading}
        className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Membuat Draft..." : "+ Survey Baru"}
      </button>

      {error ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [userCode, setUserCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userCode: userCode.trim().toUpperCase(),
          password,
        }),
      });

      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(result.error || "User Code atau password tidak benar.");
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Terjadi kesalahan saat login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            Tire Survey WebApp
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Silakan masuk menggunakan User Code Anda.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="user-code" className="mb-1 block text-sm font-medium text-slate-900">
              User Code
            </label>
            <input
              id="user-code"
              type="text"
              value={userCode}
              onChange={(event) => setUserCode(event.target.value.toUpperCase())}
              required
              autoCapitalize="characters"
              autoComplete="username"
              spellCheck={false}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {error && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Memproses..." : "Login"}
          </button>
        </form>
      </div>
    </main>
  );
}

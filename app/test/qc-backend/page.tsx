import { requireRole } from "@/lib/auth";

export default async function QcBackendTestPage() {
  const { profile } = await requireRole(["qc_backend"]);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">
        QC + Backend Area
      </h1>

      <p className="mt-2">
        Halo {profile.full_name}, Anda adalah QC + Backend.
      </p>
    </main>
  );
}
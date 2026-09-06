import { requireRole } from "@/lib/auth";

export default async function AdminTestPage() {
  const { profile } = await requireRole(["superadmin"]);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">
        Superadmin Area
      </h1>

      <p className="mt-2">
        Halo {profile.full_name}, Anda adalah Superadmin.
      </p>
    </main>
  );
}
import { requireRole } from "@/lib/auth";

export default async function SupplierTestPage() {
  const { profile } = await requireRole(["supplier"]);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">
        Supplier Area
      </h1>

      <p className="mt-2">
        Halo {profile.full_name}, Anda adalah Supplier.
      </p>
    </main>
  );
}
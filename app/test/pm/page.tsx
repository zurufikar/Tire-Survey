import { requireRole } from "@/lib/auth";

export default async function PmTestPage() {
  const { profile } = await requireRole(["pm_pic"]);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">
        PM / PIC Area
      </h1>

      <p className="mt-2">
        Halo {profile.full_name}, Anda adalah PM / PIC.
      </p>
    </main>
  );
}
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MASTER_TABLE_KEYS, type MasterTableKey } from "@/lib/admin-master-data";
import { MasterDataManager, type MasterDataRow } from "@/components/admin/master-data-manager";

export default async function AdminMasterDataPage() {
  await requireRole(["superadmin"]);
  const supabase = await createClient();

  const [tableResults, photoCategoriesResult] = await Promise.all([
    Promise.all(
      MASTER_TABLE_KEYS.map((table) =>
        supabase.from(table).select("*").order("id"),
      ),
    ),
    supabase
      .from("tire_photo_categories")
      .select("id, code, name, scope, is_required, max_photos")
      .order("sort_order"),
  ]);

  tableResults.forEach((result, i) => {
    if (result.error) {
      throw new Error(`Gagal memuat ${MASTER_TABLE_KEYS[i]}: ${result.error.message}`);
    }
  });
  if (photoCategoriesResult.error) {
    throw new Error(`Gagal memuat kategori foto: ${photoCategoriesResult.error.message}`);
  }

  const data = Object.fromEntries(
    MASTER_TABLE_KEYS.map((table, i) => [table, tableResults[i].data ?? []]),
  ) as unknown as Record<MasterTableKey, MasterDataRow[]>;

  const provinces = (data.master_provinces ?? []) as unknown as { id: number; name: string }[];
  const tireBrands = (data.master_tire_brands ?? []) as unknown as { id: number; name: string }[];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-medium text-blue-600">Superadmin</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Master Data</h1>
          <p className="mt-1 text-sm text-slate-500">
            Menonaktifkan entri menyembunyikannya dari form survey tanpa menghapus data historis
            yang sudah memakainya.
          </p>
        </header>

        <MasterDataManager
          data={data}
          provinces={provinces.filter((p) => p.id != null)}
          tireBrands={tireBrands.filter((b) => b.id != null)}
          photoCategories={photoCategoriesResult.data ?? []}
        />
      </div>
    </main>
  );
}

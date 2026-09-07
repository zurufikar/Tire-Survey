// Shared between the /admin/master-data page (what to render) and the
// /api/admin/master-data/[table] route (what to accept). Every table here
// has an is_active column and a superadmin "for all" + "read all" RLS
// policy from 020_admin_master_data_and_audit.sql — tire_photo_categories
// deliberately isn't included: it has no is_active column and its `scope`
// is a CHECK-constrained enum tied directly into the survey photo forms,
// so it stays read-only from this screen.
export const MASTER_TABLES = [
  { key: "master_provinces", label: "Provinsi" },
  { key: "master_cities", label: "Kota" },
  { key: "master_vehicle_brands", label: "Merk Kendaraan" },
  { key: "master_tire_brands", label: "Merk Ban" },
  { key: "master_tire_sizes", label: "Ukuran Ban" },
  { key: "master_tire_patterns", label: "Pola Ban" },
] as const;

export type MasterTableKey = (typeof MASTER_TABLES)[number]["key"];

export const MASTER_TABLE_KEYS = MASTER_TABLES.map((t) => t.key) as MasterTableKey[];

export const VEHICLE_CATEGORY_OPTIONS = ["TB", "LT"] as const;

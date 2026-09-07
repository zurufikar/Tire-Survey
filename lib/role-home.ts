import type { AppRole } from "@/lib/auth";

/** Where each role lands after login / at "/" / as the shell's brand link target. */
export const ROLE_HOME: Record<AppRole, string> = {
  supplier: "/dashboard",
  qc_backend: "/qc",
  pm_pic: "/reports",
  superadmin: "/admin",
};

export const ROLE_LABEL: Record<AppRole, string> = {
  supplier: "Supplier",
  qc_backend: "QC / Backend",
  pm_pic: "PM / PIC",
  superadmin: "Superadmin",
};

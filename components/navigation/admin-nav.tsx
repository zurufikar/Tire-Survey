"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Pengguna" },
  { href: "/admin/master-data", label: "Master Data" },
  { href: "/admin/audit-log", label: "Audit Log" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Superadmin
        </span>
        {TABS.map((tab) => {
          const isActive =
            tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                isActive ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

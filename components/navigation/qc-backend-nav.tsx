import Link from "next/link";

export function QcBackendNav({ active }: { active: "qc" | "backend" }) {
  return (
    <nav className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Work Mode
        </span>
        <Link
          href="/qc"
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            active === "qc"
              ? "bg-blue-600 text-white"
              : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          QC
        </Link>
        <Link
          href="/backend"
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            active === "backend"
              ? "bg-blue-600 text-white"
              : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          Backend
        </Link>
      </div>
    </nav>
  );
}

import Link from "next/link";

export function AppBackButton({
  href,
  label = "Kembali",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      ← {label}
    </Link>
  );
}

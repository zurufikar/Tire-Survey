import { AdminNav } from "@/components/navigation/admin-nav";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="bg-slate-50 px-4 pt-6 md:px-6">
        <div className="mx-auto max-w-7xl">
          <AdminNav />
        </div>
      </div>
      {children}
    </>
  );
}

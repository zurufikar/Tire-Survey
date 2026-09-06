import { QcBackendNav } from "@/components/navigation/qc-backend-nav";

export default function BackendLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="bg-slate-50 px-4 pt-6 md:px-6">
        <div className="mx-auto max-w-7xl">
          <QcBackendNav active="backend" />
        </div>
      </div>
      {children}
    </>
  );
}

import { QcBackendNav } from "@/components/navigation/qc-backend-nav";

export default function QcLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="bg-slate-50 px-3 pt-4 md:px-5 lg:px-6">
        <div className="mx-auto max-w-[1500px]">
          <QcBackendNav active="qc" />
        </div>
      </div>
      {children}
    </>
  );
}

import { AppBackButton } from "@/components/navigation/app-back-button";

export default function SupplierEditLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="bg-slate-50 px-4 pt-6 md:px-6">
        <div className="mx-auto flex max-w-6xl justify-start">
          <AppBackButton href="/dashboard" label="Kembali ke Dashboard" />
        </div>
      </div>
      {children}
    </>
  );
}

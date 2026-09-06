import { AppBackButton } from "@/components/navigation/app-back-button";

export default function BackendDetailLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <div className="bg-slate-50 px-4 pt-3 md:px-6">
        <div className="mx-auto flex max-w-7xl justify-end">
          <AppBackButton href="/backend" label="Kembali ke Queue Backend" />
        </div>
      </div>
      {children}
    </>
  );
}

export default function AccountPendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900">
          Menunggu Aktivasi
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          Akun Anda sudah berhasil terdaftar, tetapi belum diaktifkan oleh
          administrator.
        </p>

        <p className="mt-2 text-sm text-slate-500">
          Silakan hubungi administrator untuk mengaktifkan akun Anda.
        </p>
      </div>
    </main>
  );
}
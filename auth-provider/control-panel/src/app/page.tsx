export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <main className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-12">
        <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">
          Identity &amp; Authorization Provider
        </span>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
          Auth Provider
        </h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-slate-600 sm:text-lg">
          Pusat autentikasi untuk App A dan App B. Proses login dimulai dari aplikasi yang ingin
          kamu akses.
        </p>
        <div className="mt-8 flex items-center gap-3 border-t border-slate-200 pt-6 text-sm text-slate-700">
          <span
            className="h-2.5 w-2.5 rounded-full bg-green-600 ring-4 ring-green-100"
            aria-hidden="true"
          />
          Layanan autentikasi tersedia
        </div>
      </main>
    </div>
  );
}

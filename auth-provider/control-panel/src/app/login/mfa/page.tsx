import Link from 'next/link';
import { buildPublicAuthServerUrl } from '@/lib/auth-server-url';

interface MfaLoginPageProps {
  searchParams: Promise<{
    error?: string | string[];
  }>;
}

function readSingle(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function MfaLoginPage({ searchParams }: MfaLoginPageProps) {
  const params = await searchParams;
  const hasVerificationError = readSingle(params.error) === 'invalid_or_expired_code';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-9">
        <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">
          Verifikasi dua langkah
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
          Masukkan kode authenticator
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          Buka aplikasi authenticator yang terhubung dengan akunmu, lalu masukkan kode enam digit
          yang sedang aktif.
        </p>

        {hasVerificationError ? (
          <div
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
            role="alert"
          >
            Kode tidak valid atau waktu verifikasi telah berakhir. Mulai login kembali jika perlu.
          </div>
        ) : null}

        <form
          className="mt-6 flex flex-col"
          action={buildPublicAuthServerUrl('/auth/login/mfa/continue')}
          method="post"
        >
          <label className="mb-2 text-sm font-semibold text-slate-700" htmlFor="mfa-code">
            Kode enam digit
          </label>
          <input
            autoComplete="one-time-code"
            autoFocus
            className="h-12 rounded-lg border border-slate-300 px-3 font-mono text-xl tracking-[0.35em] text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
            id="mfa-code"
            inputMode="numeric"
            maxLength={6}
            name="code"
            pattern="\d{6}"
            placeholder="000000"
            required
          />

          <button
            className="mt-5 h-11 cursor-pointer rounded-lg bg-blue-600 px-4 font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30"
            type="submit"
          >
            Verifikasi dan lanjutkan
          </button>
        </form>

        <Link
          className="mt-5 block text-center text-sm font-semibold text-slate-600 hover:text-blue-700 hover:underline"
          href="/"
        >
          Batalkan login
        </Link>
      </main>
    </div>
  );
}

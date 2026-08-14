import { buildPublicAuthServerUrl } from '@/lib/auth-server-url';

interface AdminLoginPageProps {
  searchParams: Promise<{
    error?: string | string[];
    notice?: string | string[];
  }>;
}

function readSingle(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const query = await searchParams;
  const error = readSingle(query.error);
  const notice = readSingle(query.notice);
  const errorMessage =
    error === 'admin_required'
      ? 'Central session aktif, tetapi akun ini bukan administrator.'
      : error === 'session_required'
        ? 'Silakan masuk untuk membuka Control Panel.'
        : error === 'invalid_credentials'
          ? 'Email atau password tidak valid.'
          : null;
  const noticeMessage =
    notice === 'password_changed'
      ? 'Password berhasil diubah. Seluruh session dan token akun telah dicabut; silakan login kembali.'
      : notice === 'membership_changed'
        ? 'Membership berhasil dihapus dan jalur ALLOW terakhir ke aplikasi terdampak hilang. Seluruh session dan token telah dicabut; silakan login kembali.'
        : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-9">
        <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">
          Control Panel Admin
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
          Masuk sebagai admin
        </h1>
        <p className="mt-3 leading-7 text-slate-600">
          Gunakan akun administrator Auth Provider untuk mengelola user, group, aplikasi, dan
          policy.
        </p>

        {noticeMessage ? (
          <div
            className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm leading-6 text-green-900"
            role="status"
          >
            {noticeMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        <form
          className="mt-6 flex flex-col"
          action={buildPublicAuthServerUrl('/auth/login/admin')}
          method="post"
        >
          <label className="mb-2 text-sm font-semibold text-slate-700" htmlFor="email">
            Email
          </label>
          <input
            className="mb-5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            maxLength={320}
            placeholder="admin@example.com"
            required
            autoFocus
          />

          <label className="mb-2 text-sm font-semibold text-slate-700" htmlFor="password">
            Password
          </label>
          <input
            className="mb-5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={1024}
            required
          />

          <button
            className="h-11 cursor-pointer rounded-lg bg-blue-600 px-4 font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30"
            type="submit"
          >
            Masuk ke Control Panel
          </button>
        </form>
      </main>
    </div>
  );
}

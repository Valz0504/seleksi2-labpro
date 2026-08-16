import Link from 'next/link';
import { buildPublicAuthServerUrl } from '@/lib/auth-server-url';
import { getPublicSession } from '@/lib/public-session';

interface HomeProps {
  searchParams: Promise<{
    session_notice?: string | string[];
  }>;
}

function readSingle(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

export default async function Home({ searchParams }: HomeProps) {
  const [params, sessionLookup] = await Promise.all([searchParams, getPublicSession()]);
  const wasLoggedOut = readSingle(params.session_notice) === 'sso_logged_out';

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

        {wasLoggedOut ? (
          <div
            className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm leading-6 text-green-800"
            role="status"
          >
            Kamu berhasil logout dari central SSO.
          </div>
        ) : null}

        {sessionLookup.status === 'active' ? (
          <section className="mt-8 border-t border-slate-200 pt-6" aria-labelledby="session-title">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-3 text-sm font-semibold text-green-700">
                  <span
                    className="h-2.5 w-2.5 rounded-full bg-green-600 ring-4 ring-green-100"
                    aria-hidden="true"
                  />
                  Central session aktif
                </div>
                <h2 className="mt-4 text-2xl font-bold text-slate-950" id="session-title">
                  Halo, {sessionLookup.session.user.name}
                </h2>
                <p className="mt-1 text-slate-600">{sessionLookup.session.user.email}</p>
              </div>

              {sessionLookup.session.user.role === 'ADMIN' ? (
                <Link
                  className="text-sm font-semibold text-blue-700 hover:text-blue-800 hover:underline"
                  href="/admin"
                >
                  Buka Control Panel
                </Link>
              ) : null}
            </div>

            <dl className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-500">Dibuat</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {formatDate(sessionLookup.session.session.createdAt)} WIB
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Berlaku sampai</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {formatDate(sessionLookup.session.session.expiresAt)} WIB
                </dd>
              </div>
            </dl>

            <form
              className="mt-6"
              action={buildPublicAuthServerUrl('/auth/logout/browser')}
              method="post"
            >
              <button
                className="cursor-pointer rounded-lg bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-red-600/30"
                type="submit"
              >
                SSO Logout
              </button>
            </form>
          </section>
        ) : null}

        {sessionLookup.status === 'none' ? (
          <div className="mt-8 flex items-center gap-3 border-t border-slate-200 pt-6 text-sm text-slate-700">
            <span
              className="h-2.5 w-2.5 rounded-full bg-slate-400 ring-4 ring-slate-100"
              aria-hidden="true"
            />
            Belum ada central session aktif. Mulai login dari App A atau App B.
          </div>
        ) : null}

        {sessionLookup.status === 'unavailable' ? (
          <div
            className="mt-8 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
            role="alert"
          >
            Status central session belum dapat diperiksa. Coba muat ulang halaman ini.
          </div>
        ) : null}
      </main>
    </div>
  );
}

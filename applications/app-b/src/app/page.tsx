import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveLocalSession } from '@/src/lib/auth/local-session';
import { getRelyingApplicationConfig } from '@/src/lib/config/server';

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
});

function readSessionNotice(value: string | string[] | undefined): string | null {
  if (value === 'expired') {
    return 'Local session sudah kedaluwarsa. Silakan login kembali.';
  }

  if (value === 'revoked') {
    return 'Local session telah dicabut. Silakan login kembali.';
  }

  if (value === 'invalid') {
    return 'Local session tidak valid. Silakan login kembali.';
  }

  return null;
}

export default async function Home({ searchParams }: HomeProps) {
  const query = await searchParams;
  const cookieStore = await cookies();
  const config = getRelyingApplicationConfig();
  const token = cookieStore.get(config.localSessionCookieName)?.value;
  const callbackFailed = query['login_error'] === 'oauth_callback_failed';
  const requestId = typeof query['request_id'] === 'string' ? query['request_id'] : null;
  const sessionNotice = readSessionNotice(query['session_notice']);

  if (token) {
    const resolution = await resolveLocalSession(token).catch(() => null);

    if (!resolution) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
          <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-9">
            <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">App B</span>
            <h1 className="mt-3 text-2xl font-bold text-slate-950">
              Session belum dapat diperiksa
            </h1>
            <p className="mt-3 leading-7 text-slate-600">
              Koneksi penyimpanan lokal sedang bermasalah. Silakan muat ulang halaman.
            </p>
          </section>
        </main>
      );
    }

    if (resolution.state !== 'ACTIVE') {
      redirect('/auth/session/clear');
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-9">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">App B</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
              Local session aktif
            </span>
          </div>

          <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-950">
            Hello, {resolution.profile.name}
          </h1>
          <p className="mt-2 text-slate-600">{resolution.profile.email}</p>

          <dl className="mt-6 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm">
            <div>
              <dt className="font-medium text-slate-500">Session dibuat</dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {dateTimeFormatter.format(resolution.session.createdAt)} WIB
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Session berakhir</dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {dateTimeFormatter.format(resolution.session.expiresAt)} WIB
              </dd>
            </div>
          </dl>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-9">
        <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">App B</span>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Masuk ke App B</h1>
        <p className="mt-3 leading-7 text-slate-600">Belum ada local session.</p>

        {callbackFailed ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>Login tidak dapat diselesaikan. Silakan mulai ulang proses login.</p>
            {requestId ? (
              <p className="mt-1 text-xs text-red-700">Request ID: {requestId}</p>
            ) : null}
          </div>
        ) : null}

        {sessionNotice ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {sessionNotice}
          </div>
        ) : null}

        <form action="/auth/login" method="post" className="mt-6">
          <button
            type="submit"
            className="h-11 w-full cursor-pointer rounded-lg bg-blue-600 px-4 font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30"
          >
            Login melalui Auth Provider
          </button>
        </form>
      </section>
    </main>
  );
}

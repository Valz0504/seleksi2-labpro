import { buildPublicAuthServerUrl } from '@/lib/auth-server-url';

interface LoginPageProps {
  searchParams: Promise<{
    error?: string | string[];
    return_to?: string | string[];
  }>;
}

function readSingle(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readAuthorizationClient(returnTo: string | undefined): string | null {
  if (!returnTo?.startsWith('/') || returnTo.startsWith('//')) {
    return null;
  }

  try {
    const authorizationUrl = new URL(returnTo, 'http://auth-server.internal');

    if (
      authorizationUrl.origin !== 'http://auth-server.internal' ||
      authorizationUrl.pathname !== '/authorize' ||
      authorizationUrl.hash !== ''
    ) {
      return null;
    }

    return authorizationUrl.searchParams.get('client_id');
  } catch {
    return null;
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = readSingle(params.return_to);
  const clientId = readAuthorizationClient(returnTo);
  const hasCredentialError = readSingle(params.error) === 'invalid_credentials';

  if (!returnTo || !clientId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-9">
          <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">
            Auth Provider
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
            Permintaan login tidak valid
          </h1>
          <p className="mt-3 leading-7 text-slate-600">
            Mulai proses login dari App A atau App B agar tujuan login dapat diverifikasi.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <main className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-9">
        <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">
          Central SSO
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Masuk ke akunmu</h1>
        <p className="mt-3 leading-7 text-slate-600">
          Gunakan akun Auth Provider untuk melanjutkan ke{' '}
          <strong className="font-semibold text-slate-800">{clientId}</strong>.
        </p>

        {hasCredentialError ? (
          <div
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
            role="alert"
          >
            Email atau password tidak valid. Silakan coba lagi.
          </div>
        ) : null}

        <form
          className="mt-6 flex flex-col"
          action={buildPublicAuthServerUrl('/auth/login/continue')}
          method="post"
        >
          <input type="hidden" name="returnTo" value={returnTo} />

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
            placeholder="nama@example.com"
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
            Masuk dan lanjutkan
          </button>
        </form>

        <p className="mt-5 text-center text-sm leading-6 text-slate-500">
          Setelah berhasil, kamu akan dikembalikan ke aplikasi secara otomatis.
        </p>
      </main>
    </div>
  );
}

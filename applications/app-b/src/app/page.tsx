import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveLocalSession, type ActiveLocalSession } from '@/src/lib/auth/local-session';
import { getRelyingApplicationConfig } from '@/src/lib/config/server';
import { getLocalSessionDashboard } from '@/src/lib/dashboard/server';
import type { LocalDashboardViewModel } from '@/src/lib/dashboard/view-model';

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface ActiveDashboardProps {
  resolution: ActiveLocalSession;
  dashboard: LocalDashboardViewModel | null;
  logoutFailed: boolean;
  requestId: string | null;
}

const APPLICATION_NAME = 'App B';

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
});

function formatDateTime(value: Date): string {
  return `${dateTimeFormatter.format(value)} WIB`;
}

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

  if (value === 'logged_out') {
    return `Anda telah logout dari ${APPLICATION_NAME}. Central session dan session aplikasi lain tidak berubah.`;
  }

  return null;
}

function activityResultClasses(result: string): string {
  const normalizedResult = result.toUpperCase();

  if (normalizedResult === 'SUCCESS' || normalizedResult === 'SUCCEEDED') {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (
    normalizedResult === 'FAILURE' ||
    normalizedResult === 'FAILED' ||
    normalizedResult === 'ERROR'
  ) {
    return 'bg-red-100 text-red-700';
  }

  return 'bg-slate-100 text-slate-700';
}

function ActiveDashboard({ resolution, dashboard, logoutFailed, requestId }: ActiveDashboardProps) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-6xl gap-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">
                {APPLICATION_NAME}
              </span>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Hello, {resolution.profile.name}
              </h1>
              <p className="mt-2 text-slate-600">{resolution.profile.email}</p>
            </div>
            <div className="flex items-start gap-3 sm:flex-col sm:items-end">
              <span className="w-fit rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">
                Local session aktif
              </span>
              <form action="/auth/logout" method="post">
                <button
                  type="submit"
                  className="cursor-pointer rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:border-red-300 hover:bg-red-100 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-red-600/30"
                >
                  Logout dari {APPLICATION_NAME}
                </button>
              </form>
              <p className="max-w-52 text-right text-xs leading-5 text-slate-500">
                Hanya mengakhiri local session {APPLICATION_NAME}.
              </p>
            </div>
          </div>
        </header>

        {logoutFailed ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900">
            <h2 className="font-bold">Logout belum dapat diselesaikan</h2>
            <p className="mt-1 text-sm leading-6">
              Local session tetap dipertahankan agar Anda dapat mencoba logout kembali.
            </p>
            {requestId ? (
              <p className="mt-2 text-xs text-red-700">Request ID: {requestId}</p>
            ) : null}
          </section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-7">
            <h2 className="text-lg font-bold text-slate-950">Profil</h2>
            <dl className="mt-5 grid gap-5 text-sm">
              <div>
                <dt className="font-medium text-slate-500">Group</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {resolution.profile.groups.length > 0 ? (
                    resolution.profile.groups.map((group) => (
                      <span
                        key={group}
                        className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-semibold text-blue-700"
                      >
                        {group}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-600">Tidak ada group pada profil.</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Profil terakhir disinkronkan</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {formatDateTime(resolution.profile.syncedAt)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-7">
            <h2 className="text-lg font-bold text-slate-950">Local Session</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-500">Status</dt>
                <dd className="mt-1 font-semibold text-emerald-700">{resolution.session.status}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Dibuat</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {formatDateTime(resolution.session.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Berakhir</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {formatDateTime(resolution.session.expiresAt)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Aktivitas terakhir</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {formatDateTime(resolution.session.lastActivityAt)}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        {dashboard ? (
          <>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
              <div className="border-b border-slate-200 px-6 py-5 sm:px-7">
                <h2 className="text-lg font-bold text-slate-950">Activity Log</h2>
                <p className="mt-1 text-sm text-slate-500">Aktivitas terbaru untuk user ini.</p>
              </div>

              {dashboard.activityLogs.length > 0 ? (
                <ol className="divide-y divide-slate-200">
                  {dashboard.activityLogs.map((activity) => (
                    <li key={activity.id} className="px-6 py-5 sm:px-7">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-slate-900">{activity.eventType}</h3>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-bold ${activityResultClasses(activity.result)}`}
                            >
                              {activity.result}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {activity.message}
                          </p>
                          {activity.requestId ? (
                            <p className="mt-2 break-all text-xs text-slate-500">
                              Request ID: {activity.requestId}
                            </p>
                          ) : null}
                        </div>
                        <time
                          dateTime={activity.createdAt.toISOString()}
                          className="shrink-0 text-xs font-medium text-slate-500"
                        >
                          {formatDateTime(activity.createdAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-6 py-10 text-center text-sm text-slate-500 sm:px-7">
                  Belum ada activity log untuk user ini.
                </p>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
              <div className="border-b border-slate-200 px-6 py-5 sm:px-7">
                <h2 className="text-lg font-bold text-slate-950">Processed Events</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Event revocation terbaru yang sudah diproses aplikasi.
                </p>
              </div>

              {dashboard.processedEvents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                      <tr>
                        <th scope="col" className="px-6 py-3 font-semibold sm:px-7">
                          Event
                        </th>
                        <th scope="col" className="px-6 py-3 font-semibold">
                          Diproses
                        </th>
                        <th scope="col" className="px-6 py-3 font-semibold sm:pr-7">
                          Tindakan
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {dashboard.processedEvents.map((event) => (
                        <tr key={event.eventId} className="align-top">
                          <td className="px-6 py-4 sm:pl-7">
                            <p className="font-semibold text-slate-900">{event.eventType}</p>
                            <p className="mt-1 max-w-xs break-all font-mono text-xs text-slate-500">
                              {event.eventId}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-slate-600">
                            <time dateTime={event.processedAt.toISOString()}>
                              {formatDateTime(event.processedAt)}
                            </time>
                          </td>
                          <td className="px-6 py-4 text-slate-600 sm:pr-7">{event.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-6 py-10 text-center text-sm text-slate-500 sm:px-7">
                  Belum ada processed event.
                </p>
              )}
            </section>
          </>
        ) : (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
            <h2 className="font-bold">Data dashboard belum dapat dimuat</h2>
            <p className="mt-2 text-sm leading-6">
              Profil dan local session Anda tetap aktif. Silakan muat ulang halaman untuk mencoba
              lagi.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

export default async function Home({ searchParams }: HomeProps) {
  const query = await searchParams;
  const cookieStore = await cookies();
  const config = getRelyingApplicationConfig();
  const token = cookieStore.get(config.localSessionCookieName)?.value;
  const callbackFailed = query['login_error'] === 'oauth_callback_failed';
  const requestId = typeof query['request_id'] === 'string' ? query['request_id'] : null;
  const sessionNotice = readSessionNotice(query['session_notice']);
  const logoutFailed = query['logout_error'] === 'local_logout_failed';

  if (token) {
    const resolution = await resolveLocalSession(token).catch(() => null);

    if (!resolution) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
          <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-9">
            <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">
              {APPLICATION_NAME}
            </span>
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

    const dashboard = await getLocalSessionDashboard({
      externalUserId: resolution.profile.externalUserId,
      localSessionId: resolution.session.id,
    }).catch(() => null);

    return (
      <ActiveDashboard
        resolution={resolution}
        dashboard={dashboard}
        logoutFailed={logoutFailed}
        requestId={requestId}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-9">
        <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">
          {APPLICATION_NAME}
        </span>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
          Masuk ke {APPLICATION_NAME}
        </h1>
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

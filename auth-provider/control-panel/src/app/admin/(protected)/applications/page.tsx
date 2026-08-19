import Link from 'next/link';
import { getAdminApplications, type AdminApplication } from '@/lib/admin-session';

interface AdminApplicationsPageProps {
  searchParams: Promise<{
    created?: string | string[];
  }>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

function StatusBadge({ status }: Pick<AdminApplication, 'status'>) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
        status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'
      }`}
    >
      {status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
    </span>
  );
}

export default async function AdminApplicationsPage({ searchParams }: AdminApplicationsPageProps) {
  const [applications, query] = await Promise.all([getAdminApplications(), searchParams]);

  if (!applications) {
    return (
      <section>
        <p className="text-sm font-semibold text-blue-600">Application</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
          Daftar application
        </h2>
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h3 className="font-bold">Data application belum dapat dimuat</h3>
          <p className="mt-2 leading-7 text-red-800">
            Pastikan Auth Server aktif dan central session admin masih berlaku.
          </p>
          <Link
            className="mt-4 inline-flex font-bold text-red-900 underline"
            href="/admin/applications"
          >
            Coba lagi
          </Link>
        </div>
      </section>
    );
  }

  const activeCount = applications.filter(({ status }) => status === 'ACTIVE').length;
  const inactiveCount = applications.length - activeCount;
  const wasCreated = query.created === '1';

  return (
    <>
      <section>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">Application</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              Daftar application
            </h2>
            <p className="mt-3 max-w-2xl leading-7 text-slate-600">
              Lihat OAuth client, exact redirect URI, serta group yang diperbolehkan mengakses
              setiap application.
            </p>
          </div>
          <Link
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30"
            href="/admin/applications/new"
          >
            Daftarkan application
          </Link>
        </div>
      </section>

      {wasCreated ? (
        <div
          className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold text-green-900"
          role="status"
        >
          Application berhasil didaftarkan. Client secret hanya ditampilkan pada halaman hasil
          pendaftaran.
        </div>
      ) : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="Ringkasan application">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Total application</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{applications.length}</p>
        </article>
        <article className="rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-semibold text-green-700">Aktif</p>
          <p className="mt-1 text-2xl font-bold text-green-950">{activeCount}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-600">Nonaktif</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{inactiveCount}</p>
        </article>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {applications.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="font-bold text-slate-900">Belum ada application</h3>
            <p className="mt-2 text-sm text-slate-500">
              Daftarkan OAuth client pertama yang mempercayai Auth Provider.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Application
                  </th>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Status
                  </th>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Exact redirect URI
                  </th>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Group diizinkan
                  </th>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Diperbarui
                  </th>
                  <th className="px-5 py-3 text-right font-bold" scope="col">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map((application) => (
                  <tr className="align-top hover:bg-slate-50/70" key={application.id}>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">{application.name}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {application.clientId}
                      </p>
                      {application.launchUrl ? (
                        <a
                          className="mt-2 inline-flex max-w-xs break-all text-xs font-semibold text-blue-700 hover:text-blue-800"
                          href={application.launchUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {application.launchUrl}
                        </a>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={application.status} />
                    </td>
                    <td className="px-5 py-4">
                      <ul className="max-w-md space-y-2">
                        {application.redirectUris.map(({ id, redirectUri }) => (
                          <li className="break-all font-mono text-xs text-slate-600" key={id}>
                            {redirectUri}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-5 py-4">
                      {application.groupPolicies.length > 0 ? (
                        <div className="flex max-w-sm flex-wrap gap-2">
                          {application.groupPolicies.map(({ id, group }) => (
                            <span
                              className="rounded-md bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-800"
                              key={id}
                            >
                              {group.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">Belum ada policy</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                      {formatDate(application.updatedAt)} WIB
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        className="font-bold text-blue-700 hover:text-blue-800"
                        href={`/admin/applications/${encodeURIComponent(application.id)}`}
                      >
                        Lihat detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

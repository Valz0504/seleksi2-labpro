import Link from 'next/link';
import { getAdminGroups } from '@/lib/admin-session';

interface AdminGroupsPageProps {
  searchParams: Promise<{
    created?: string | string[];
    deleted?: string | string[];
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

export default async function AdminGroupsPage({ searchParams }: AdminGroupsPageProps) {
  const [groups, query] = await Promise.all([getAdminGroups(), searchParams]);

  if (!groups) {
    return (
      <section>
        <p className="text-sm font-semibold text-blue-600">Group</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Daftar group</h2>
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h3 className="font-bold">Data group belum dapat dimuat</h3>
          <p className="mt-2 leading-7 text-red-800">
            Pastikan Auth Server aktif dan central session admin masih berlaku.
          </p>
          <Link className="mt-4 inline-flex font-bold text-red-900 underline" href="/admin/groups">
            Coba lagi
          </Link>
        </div>
      </section>
    );
  }

  const membershipCount = groups.reduce((total, group) => total + group.userGroups.length, 0);
  const policyCount = groups.reduce((total, group) => total + group.policies.length, 0);
  const wasCreated = readSingle(query.created) === '1';
  const wasDeleted = readSingle(query.deleted) === '1';

  return (
    <>
      <section>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">Group</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Daftar group</h2>
            <p className="mt-3 max-w-2xl leading-7 text-slate-600">
              Kelompokkan pengguna dan lihat policy ALLOW yang menghubungkan setiap group dengan
              aplikasi.
            </p>
          </div>
          <Link
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30"
            href="/admin/groups/new"
          >
            Tambah group
          </Link>
        </div>
      </section>

      {wasCreated ? (
        <div
          className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold text-green-900"
          role="status"
        >
          Group berhasil dibuat.
        </div>
      ) : null}

      {wasDeleted ? (
        <div
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-950"
          role="status"
        >
          Group beserta keanggotaan dan policy terkait berhasil dihapus. User yang kehilangan jalur
          ALLOW terakhir telah mengalami revocation.
        </div>
      ) : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="Ringkasan group">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Total group</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{groups.length}</p>
        </article>
        <article className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm font-semibold text-blue-700">Relasi pengguna</p>
          <p className="mt-1 text-2xl font-bold text-blue-950">{membershipCount}</p>
        </article>
        <article className="rounded-xl border border-violet-200 bg-violet-50 p-5">
          <p className="text-sm font-semibold text-violet-700">Policy ALLOW</p>
          <p className="mt-1 text-2xl font-bold text-violet-950">{policyCount}</p>
        </article>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {groups.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="font-bold text-slate-900">Belum ada group</h3>
            <p className="mt-2 text-sm text-slate-500">
              Buat group pertama untuk mulai mengatur akses pengguna.
            </p>
            <Link
              className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
              href="/admin/groups/new"
            >
              Tambah group
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Group
                  </th>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Anggota
                  </th>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Akses aplikasi
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
                {groups.map((group) => (
                  <tr className="align-top hover:bg-slate-50/70" key={group.id}>
                    <td className="max-w-sm px-5 py-4">
                      <p className="font-bold text-slate-900">{group.name}</p>
                      <p className="mt-1 line-clamp-2 leading-6 text-slate-500">
                        {group.description ?? 'Tanpa deskripsi.'}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-800">{group.userGroups.length} pengguna</p>
                      {group.userGroups.length > 0 ? (
                        <p className="mt-1 max-w-xs text-slate-500">
                          {group.userGroups
                            .slice(0, 3)
                            .map(({ user }) => user.name)
                            .join(', ')}
                          {group.userGroups.length > 3
                            ? `, +${group.userGroups.length - 3} lainnya`
                            : ''}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      {group.policies.length > 0 ? (
                        <div className="flex max-w-sm flex-wrap gap-2">
                          {group.policies.map(({ id, application }) => (
                            <span
                              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                                application.status === 'ACTIVE'
                                  ? 'bg-violet-50 text-violet-800'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                              key={id}
                            >
                              {application.name}
                              {application.status === 'INACTIVE' ? ' · nonaktif' : ''}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">Belum ada policy</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                      {formatDate(group.updatedAt)} WIB
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        className="font-bold text-blue-700 hover:text-blue-800"
                        href={`/admin/groups/${encodeURIComponent(group.id)}`}
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

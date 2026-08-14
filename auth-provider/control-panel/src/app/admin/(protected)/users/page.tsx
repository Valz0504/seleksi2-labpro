import Link from 'next/link';
import { getAdminUsers, type AdminUser } from '@/lib/admin-session';

interface AdminUsersPageProps {
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

function StatusBadge({ status }: Pick<AdminUser, 'status'>) {
  const isActive = status === 'ACTIVE';

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
        isActive ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'
      }`}
    >
      {isActive ? 'Aktif' : 'Nonaktif'}
    </span>
  );
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const [users, query] = await Promise.all([getAdminUsers(), searchParams]);
  const wasCreated = query.created === '1';

  if (!users) {
    return (
      <section>
        <p className="text-sm font-semibold text-blue-600">Pengguna</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Daftar pengguna</h2>
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h3 className="font-bold">Data pengguna belum dapat dimuat</h3>
          <p className="mt-2 leading-7 text-red-800">
            Pastikan Auth Server aktif dan central session admin masih berlaku.
          </p>
          <Link className="mt-4 inline-flex font-bold text-red-900 underline" href="/admin/users">
            Coba lagi
          </Link>
        </div>
      </section>
    );
  }

  const activeUsers = users.filter(({ status }) => status === 'ACTIVE').length;
  const inactiveUsers = users.length - activeUsers;

  return (
    <>
      <section>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">Pengguna</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              Daftar pengguna
            </h2>
            <p className="mt-3 max-w-2xl leading-7 text-slate-600">
              Lihat identitas, role, status akun, dan group yang menentukan akses setiap pengguna.
            </p>
          </div>
          <Link
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30"
            href="/admin/users/new"
          >
            Tambah pengguna
          </Link>
        </div>
      </section>

      {wasCreated ? (
        <div
          className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold text-green-900"
          role="status"
        >
          Pengguna berhasil dibuat dan sudah aktif.
        </div>
      ) : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="Ringkasan pengguna">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-500">Total</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{users.length}</p>
        </article>
        <article className="rounded-xl border border-green-200 bg-green-50 p-5">
          <p className="text-sm font-semibold text-green-700">Aktif</p>
          <p className="mt-1 text-2xl font-bold text-green-950">{activeUsers}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-600">Nonaktif</p>
          <p className="mt-1 text-2xl font-bold text-slate-950">{inactiveUsers}</p>
        </article>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {users.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="font-bold text-slate-900">Belum ada pengguna</h3>
            <p className="mt-2 text-sm text-slate-500">
              Pengguna yang dibuat melalui Auth Provider akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Pengguna
                  </th>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Role
                  </th>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Status
                  </th>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Group
                  </th>
                  <th className="px-5 py-3 font-bold" scope="col">
                    Diperbarui
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr className="align-top hover:bg-slate-50/70" key={user.id}>
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">{user.name}</p>
                      <p className="mt-1 text-slate-500">{user.email}</p>
                    </td>
                    <td className="px-5 py-4 font-semibold text-slate-700">
                      {user.role === 'ADMIN' ? 'Admin' : 'User'}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-5 py-4">
                      {user.userGroups.length > 0 ? (
                        <div className="flex max-w-sm flex-wrap gap-2">
                          {user.userGroups.map(({ id, group }) => (
                            <span
                              className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800"
                              key={id}
                              title={group.description ?? undefined}
                            >
                              {group.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">Belum ada group</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                      {formatDate(user.updatedAt)} WIB
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

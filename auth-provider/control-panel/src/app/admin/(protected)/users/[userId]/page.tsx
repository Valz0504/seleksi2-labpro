import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getAdminGroups,
  getAdminUser,
  getCurrentAdminSession,
  type AdminUser,
} from '@/lib/admin-session';
import { UpdatePasswordForm } from './update-password-form';
import { UpdateUserForm } from './update-user-form';
import { UserMembershipManager } from './user-membership-manager';
import { UserStatusForm } from './user-status-form';

interface AdminUserDetailPageProps {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{
    updated?: string | string[];
    status?: string | string[];
    password?: string | string[];
    membership?: string | string[];
  }>;
}

function readSingle(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

function StatusBadge({ status }: Pick<AdminUser, 'status'>) {
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

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: AdminUserDetailPageProps) {
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  const [result, currentSession, groups] = await Promise.all([
    getAdminUser(userId),
    getCurrentAdminSession(),
    getAdminGroups(),
  ]);

  if (result.status === 'not_found') {
    notFound();
  }

  if (result.status === 'error') {
    return (
      <section>
        <Link className="text-sm font-bold text-blue-700 hover:text-blue-800" href="/admin/users">
          ← Kembali ke daftar pengguna
        </Link>
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="text-xl font-bold">Detail pengguna belum dapat dimuat</h2>
          <p className="mt-2 leading-7 text-red-800">
            Pastikan Auth Server aktif dan central session admin masih berlaku.
          </p>
        </div>
      </section>
    );
  }

  const { user } = result;
  const wasUpdated = query.updated === '1';
  const statusResult = readSingle(query.status);
  const passwordResult = readSingle(query.password);
  const membershipResult = readSingle(query.membership);
  const isCurrentUser = currentSession?.user.id === user.id;

  return (
    <>
      <Link className="text-sm font-bold text-blue-700 hover:text-blue-800" href="/admin/users">
        ← Kembali ke daftar pengguna
      </Link>

      <section className="mt-5">
        <p className="text-sm font-semibold text-blue-600">Detail pengguna</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="text-3xl font-bold tracking-tight text-slate-950">{user.name}</h2>
          <StatusBadge status={user.status} />
        </div>
        <p className="mt-2 text-slate-600">{user.email}</p>
      </section>

      {wasUpdated ? (
        <div
          className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold text-green-900"
          role="status"
        >
          Profil pengguna berhasil diperbarui.
        </div>
      ) : null}

      {statusResult === 'deactivated' ? (
        <div
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-950"
          role="status"
        >
          Pengguna dinonaktifkan. Seluruh central session dan access token aktifnya telah dicabut.
        </div>
      ) : null}

      {statusResult === 'activated' ? (
        <div
          className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold leading-6 text-green-900"
          role="status"
        >
          Pengguna diaktifkan kembali. Session dan token lama tetap tidak berlaku; pengguna harus
          login lagi.
        </div>
      ) : null}

      {passwordResult === 'changed' ? (
        <div
          className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold leading-6 text-green-900"
          role="status"
        >
          Password berhasil diubah. Seluruh central session dan access token aktif pengguna telah
          dicabut.
        </div>
      ) : null}

      {membershipResult === 'added' ? (
        <div
          className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold leading-6 text-green-900"
          role="status"
        >
          User berhasil dimasukkan ke group. Policy group berlaku pada authorization user
          berikutnya.
        </div>
      ) : null}

      {membershipResult === 'removed' ? (
        <div
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-950"
          role="status"
        >
          User berhasil dikeluarkan dari group. Policy telah dievaluasi ulang; apabila jalur ALLOW
          terakhir hilang, seluruh central session dan access token aktif user telah dicabut.
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h3 className="text-xl font-bold text-slate-950">Edit profil</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Perubahan nama dan email dicatat sebagai aktivitas administrasi.
          </p>
          <div className="mt-6">
            <UpdateUserForm userId={user.id} name={user.name} email={user.email} />
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-bold text-slate-950">Informasi akun</h3>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="font-semibold text-slate-500">Role</dt>
                <dd className="mt-1 font-bold text-slate-900">
                  {user.role === 'ADMIN' ? 'Admin' : 'User'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Dibuat</dt>
                <dd className="mt-1 text-slate-800">{formatDate(user.createdAt)} WIB</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Diperbarui</dt>
                <dd className="mt-1 text-slate-800">{formatDate(user.updatedAt)} WIB</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">ID</dt>
                <dd className="mt-1 break-all font-mono text-xs text-slate-700">{user.id}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      <section className="mt-8">
        <p className="text-sm font-semibold text-blue-600">Kontrol akses</p>
        <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Keanggotaan group</h3>
        <p className="mt-2 max-w-3xl leading-7 text-slate-600">
          Group menghubungkan user dengan policy ALLOW milik aplikasi. Mengeluarkan user dari group
          hanya mencabut session dan token jika user tidak lagi memiliki jalur ALLOW lain ke
          aplikasi yang terdampak.
        </p>
        <div className="mt-6">
          <UserMembershipManager userId={user.id} memberships={user.userGroups} groups={groups} />
        </div>
      </section>

      <section className="mt-8">
        <p className="text-sm font-semibold text-blue-600">Keamanan akun</p>
        <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          Status dan credential
        </h3>
        <p className="mt-2 max-w-3xl leading-7 text-slate-600">
          Kedua perubahan berikut memengaruhi kemampuan user untuk memakai central session dan
          access token yang sudah diterbitkan.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-xl font-bold text-slate-950">Status pengguna</h4>
              <StatusBadge status={user.status} />
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Kendalikan apakah user boleh login dan memperoleh akses baru.
            </p>
            <div className="mt-6">
              <UserStatusForm userId={user.id} status={user.status} isCurrentUser={isCurrentUser} />
            </div>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h4 className="text-xl font-bold text-slate-950">Ganti password</h4>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Tetapkan password awal baru tanpa pernah membaca password lama dari database.
            </p>
            <div className="mt-6">
              <UpdatePasswordForm userId={user.id} isCurrentUser={isCurrentUser} />
            </div>
          </article>
        </div>
      </section>
    </>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminGroup, getCurrentAdminSession } from '@/lib/admin-session';
import { CONTROL_PANEL_ADMIN_GROUP_NAME } from '@/lib/control-panel-access';
import { DeleteGroupForm } from './delete-group-form';
import { UpdateGroupForm } from './update-group-form';

interface AdminGroupDetailPageProps {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{
    updated?: string | string[];
  }>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

export default async function AdminGroupDetailPage({
  params,
  searchParams,
}: AdminGroupDetailPageProps) {
  const [{ groupId }, query] = await Promise.all([params, searchParams]);
  const [result, currentSession] = await Promise.all([
    getAdminGroup(groupId),
    getCurrentAdminSession(),
  ]);

  if (result.status === 'not_found') {
    notFound();
  }

  if (result.status === 'error') {
    return (
      <section>
        <Link className="text-sm font-bold text-blue-700 hover:text-blue-800" href="/admin/groups">
          ← Kembali ke daftar group
        </Link>
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="text-xl font-bold">Detail group belum dapat dimuat</h2>
          <p className="mt-2 leading-7 text-red-800">
            Pastikan Auth Server aktif dan central session admin masih berlaku.
          </p>
        </div>
      </section>
    );
  }

  const { group } = result;
  const wasUpdated = query.updated === '1';
  const isControlPanelAdminGroup = group.name === CONTROL_PANEL_ADMIN_GROUP_NAME;
  const includesCurrentAdmin = group.userGroups.some(
    ({ user }) => user.id === currentSession?.user.id,
  );

  return (
    <>
      <Link className="text-sm font-bold text-blue-700 hover:text-blue-800" href="/admin/groups">
        ← Kembali ke daftar group
      </Link>

      <section className="mt-5">
        <p className="text-sm font-semibold text-blue-600">Detail group</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{group.name}</h2>
        <p className="mt-2 max-w-3xl leading-7 text-slate-600">
          {group.description ?? 'Group ini belum memiliki deskripsi.'}
        </p>
      </section>

      {wasUpdated ? (
        <div
          className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold text-green-900"
          role="status"
        >
          Group berhasil diperbarui.
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        {isControlPanelAdminGroup ? (
          <section className="rounded-xl border border-blue-200 bg-blue-50 p-6 sm:p-8">
            <h3 className="text-xl font-bold text-blue-950">Group sistem</h3>
            <p className="mt-2 text-sm leading-6 text-blue-900">
              Membership group ini menentukan siapa yang boleh mengakses Control Panel. Nama dan
              group-nya dilindungi agar akses administrator tidak rusak.
            </p>
          </section>
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h3 className="text-xl font-bold text-slate-950">Edit group</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Nama harus unik. Perubahan group dicatat pada audit log.
            </p>
            <div className="mt-6">
              <UpdateGroupForm
                groupId={group.id}
                name={group.name}
                description={group.description}
              />
            </div>
          </section>
        )}

        <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-950">Informasi group</h3>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-semibold text-slate-500">Jumlah anggota</dt>
              <dd className="mt-1 font-bold text-slate-900">{group.userGroups.length}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Policy ALLOW</dt>
              <dd className="mt-1 font-bold text-slate-900">{group.policies.length}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Dibuat</dt>
              <dd className="mt-1 text-slate-800">{formatDate(group.createdAt)} WIB</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Diperbarui</dt>
              <dd className="mt-1 text-slate-800">{formatDate(group.updatedAt)} WIB</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">ID</dt>
              <dd className="mt-1 break-all font-mono text-xs text-slate-700">{group.id}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <p className="text-sm font-semibold text-blue-600">Keanggotaan group</p>
          <div className="mt-1 flex items-end justify-between gap-4">
            <h3 className="text-2xl font-bold tracking-tight text-slate-950">Anggota</h3>
            <span className="text-sm font-semibold text-slate-500">
              {group.userGroups.length} pengguna
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {group.userGroups.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {group.userGroups.map(({ id, user }) => (
                  <li className="flex flex-wrap items-center justify-between gap-4 p-5" key={id}>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-900">{user.name}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            user.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {user.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                        </span>
                        {currentSession?.user.id === user.id ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                            Kamu
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{user.email}</p>
                    </div>
                    <Link
                      className="text-sm font-bold text-blue-700 hover:text-blue-800"
                      href={`/admin/users/${encodeURIComponent(user.id)}`}
                    >
                      Kelola keanggotaan
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-7 text-center">
                <p className="font-semibold text-slate-700">Belum ada anggota.</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Pengguna dapat dimasukkan melalui halaman detail pengguna.
                </p>
              </div>
            )}
          </div>
        </section>

        <section>
          <p className="text-sm font-semibold text-violet-600">Kontrol akses</p>
          <div className="mt-1 flex items-end justify-between gap-4">
            <h3 className="text-2xl font-bold tracking-tight text-slate-950">Policy aplikasi</h3>
            <span className="text-sm font-semibold text-slate-500">
              {group.policies.length} policy
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {group.policies.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {group.policies.map(({ id, effect, application }) => (
                  <li className="p-5" key={id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">{application.name}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500">
                          {application.clientId}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800">
                          {effect}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            application.status === 'ACTIVE'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {application.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-7 text-center">
                <p className="font-semibold text-slate-700">Belum ada policy aplikasi.</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Group ini belum memberikan akses ke aplikasi mana pun.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {!isControlPanelAdminGroup ? (
        <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6 sm:p-8">
          <p className="text-sm font-semibold text-red-700">Zona berbahaya</p>
          <h3 className="mt-1 text-2xl font-bold tracking-tight text-red-950">Hapus group</h3>
          <p className="mt-2 max-w-3xl leading-7 text-red-900">
            Penghapusan bersifat permanen dan ikut menghapus seluruh keanggotaan serta policy milik
            group ini. Group harus dibuat dan dikonfigurasi ulang jika masih diperlukan.
          </p>
          <DeleteGroupForm
            groupId={group.id}
            groupName={group.name}
            memberCount={group.userGroups.length}
            policyCount={group.policies.length}
            includesCurrentAdmin={includesCurrentAdmin}
          />
        </section>
      ) : null}
    </>
  );
}

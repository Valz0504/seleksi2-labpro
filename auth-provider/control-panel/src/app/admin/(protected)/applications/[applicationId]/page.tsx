import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminApplication, getAdminGroups, type AdminApplication } from '@/lib/admin-session';
import { ApplicationPolicyManager } from './application-policy-manager';
import { ApplicationStatusForm } from './application-status-form';
import { RedirectUriManager } from './redirect-uri-manager';
import { UpdateApplicationForm } from './update-application-form';

interface AdminApplicationDetailPageProps {
  params: Promise<{ applicationId: string }>;
  searchParams: Promise<{
    updated?: string | string[];
    status?: string | string[];
    redirectUri?: string | string[];
    policy?: string | string[];
    revokedUsers?: string | string[];
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

export default async function AdminApplicationDetailPage({
  params,
  searchParams,
}: AdminApplicationDetailPageProps) {
  const [{ applicationId }, query] = await Promise.all([params, searchParams]);
  const [result, groups] = await Promise.all([
    getAdminApplication(applicationId),
    getAdminGroups(),
  ]);

  if (result.status === 'not_found') {
    notFound();
  }

  if (result.status === 'error') {
    return (
      <section>
        <Link
          className="text-sm font-bold text-blue-700 hover:text-blue-800"
          href="/admin/applications"
        >
          ← Kembali ke daftar application
        </Link>
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
          <h2 className="text-xl font-bold">Detail application belum dapat dimuat</h2>
          <p className="mt-2 leading-7 text-red-800">
            Pastikan Auth Server aktif dan central session admin masih berlaku.
          </p>
        </div>
      </section>
    );
  }

  const { application } = result;
  const wasUpdated = query.updated === '1';
  const statusResult = readSingle(query.status);
  const redirectUriResult = readSingle(query.redirectUri);
  const policyResult = readSingle(query.policy);
  const revokedUsersValue = readSingle(query.revokedUsers);
  const parsedRevokedUserCount =
    revokedUsersValue !== undefined && /^\d+$/.test(revokedUsersValue)
      ? Number(revokedUsersValue)
      : Number.NaN;
  const revokedUserCount =
    Number.isSafeInteger(parsedRevokedUserCount) && parsedRevokedUserCount >= 0
      ? parsedRevokedUserCount
      : null;

  return (
    <>
      <Link
        className="text-sm font-bold text-blue-700 hover:text-blue-800"
        href="/admin/applications"
      >
        ← Kembali ke daftar application
      </Link>

      <section className="mt-5">
        <p className="text-sm font-semibold text-blue-600">Detail application</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="text-3xl font-bold tracking-tight text-slate-950">{application.name}</h2>
          <StatusBadge status={application.status} />
        </div>
        <p className="mt-2 font-mono text-sm text-slate-600">{application.clientId}</p>
      </section>

      {wasUpdated ? (
        <div
          className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold text-green-900"
          role="status"
        >
          Konfigurasi application berhasil diperbarui.
        </div>
      ) : null}

      {statusResult === 'deactivated' ? (
        <div
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-950"
          role="status"
        >
          Application dinonaktifkan. Authorization dan token exchange baru ditolak, serta seluruh
          access token aktif untuk audience ini telah dicabut. Central session user tetap berlaku
          untuk application lain.
        </div>
      ) : null}

      {statusResult === 'activated' ? (
        <div
          className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold leading-6 text-green-900"
          role="status"
        >
          Application diaktifkan kembali. Access token lama tetap tidak berlaku; client harus
          memulai Authorization Code Flow baru.
        </div>
      ) : null}

      {redirectUriResult === 'added' ? (
        <div
          className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold text-green-900"
          role="status"
        >
          Redirect URI berhasil ditambahkan dan langsung tersedia untuk exact matching.
        </div>
      ) : null}

      {redirectUriResult === 'removed' ? (
        <div
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-950"
          role="status"
        >
          Redirect URI berhasil dihapus. Authorization code yang belum dipakai dan terikat pada URI
          tersebut telah dibuat tidak berlaku.
        </div>
      ) : null}

      {policyResult === 'added' ? (
        <div
          className="mt-6 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-semibold text-green-900"
          role="status"
        >
          Group berhasil diizinkan. Anggotanya memperoleh jalur ALLOW pada authorization berikutnya.
        </div>
      ) : null}

      {policyResult === 'removed' ? (
        <div
          className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold leading-6 text-amber-950"
          role="status"
        >
          Policy berhasil dihapus.{' '}
          {revokedUserCount === null
            ? 'Seluruh anggota telah dievaluasi ulang terhadap jalur ALLOW yang tersisa.'
            : revokedUserCount === 0
              ? 'Tidak ada user yang kehilangan jalur ALLOW terakhir, sehingga tidak ada session atau token yang dicabut.'
              : `${revokedUserCount} user kehilangan jalur ALLOW terakhir; central session dan seluruh access token aktif mereka telah dicabut.`}
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h3 className="text-xl font-bold text-slate-950">Edit application</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Client ID bersifat tetap. Nama dan endpoint application dapat diperbarui tanpa mengubah
            client credential.
          </p>
          <div className="mt-6">
            <UpdateApplicationForm
              applicationId={application.id}
              name={application.name}
              launchUrl={application.launchUrl}
              logoutNotificationUrl={application.logoutNotificationUrl}
            />
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-bold text-slate-950">Informasi application</h3>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="font-semibold text-slate-500">Status</dt>
                <dd className="mt-1">
                  <StatusBadge status={application.status} />
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Dibuat</dt>
                <dd className="mt-1 text-slate-800">{formatDate(application.createdAt)} WIB</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Diperbarui</dt>
                <dd className="mt-1 text-slate-800">{formatDate(application.updatedAt)} WIB</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">ID</dt>
                <dd className="mt-1 break-all font-mono text-xs text-slate-700">
                  {application.id}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-bold text-slate-950">Client credential</h3>
            <p className="mt-3 text-xs font-bold tracking-wide text-slate-500 uppercase">
              Client ID
            </p>
            <p className="mt-1 break-all font-mono text-sm text-slate-900">
              {application.clientId}
            </p>
            <p className="mt-4 text-sm leading-6 text-slate-500">
              Client secret mentah tidak dapat dibaca. Auth Provider hanya menyimpan hash-nya.
            </p>
          </section>
        </aside>
      </div>

      <section className="mt-8">
        <p className="text-sm font-semibold text-blue-600">Lifecycle OAuth client</p>
        <h3 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
          Status application
        </h3>
        <p className="mt-2 max-w-3xl leading-7 text-slate-600">
          Status mengendalikan authorization, token exchange, dan pemakaian access token untuk
          application ini tanpa menghapus central session user.
        </p>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-xl font-bold text-slate-950">Kontrol status</h4>
            <StatusBadge status={application.status} />
          </div>
          <div className="mt-5">
            <ApplicationStatusForm applicationId={application.id} status={application.status} />
          </div>
        </div>
      </section>

      <div className="mt-8 space-y-8">
        <section>
          <p className="text-sm font-semibold text-blue-600">Callback tepercaya</p>
          <div className="mt-1 flex items-end justify-between gap-4">
            <h3 className="text-2xl font-bold tracking-tight text-slate-950">Exact redirect URI</h3>
            <span className="text-sm font-semibold text-slate-500">
              {application.redirectUris.length} URI
            </span>
          </div>
          <RedirectUriManager
            applicationId={application.id}
            redirectUris={application.redirectUris}
          />
        </section>

        <section>
          <p className="text-sm font-semibold text-violet-600">Kontrol akses</p>
          <div className="mt-1 flex items-end justify-between gap-4">
            <h3 className="text-2xl font-bold tracking-tight text-slate-950">Group diizinkan</h3>
            <span className="text-sm font-semibold text-slate-500">
              {application.groupPolicies.length} policy
            </span>
          </div>
          <ApplicationPolicyManager
            applicationId={application.id}
            applicationName={application.name}
            policies={application.groupPolicies}
            groups={groups}
          />
        </section>
      </div>
    </>
  );
}

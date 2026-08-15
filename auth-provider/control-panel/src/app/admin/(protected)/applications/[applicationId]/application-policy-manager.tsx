'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useActionState } from 'react';
import type { AdminApplication, AdminGroup } from '@/lib/admin-session';
import {
  addApplicationPolicyAction,
  removeApplicationPolicyAction,
  type ApplicationPolicyActionState,
} from './actions';

const INITIAL_STATE: ApplicationPolicyActionState = { error: null };

interface ApplicationPolicyManagerProps {
  applicationId: string;
  applicationName: string;
  policies: AdminApplication['groupPolicies'];
  groups: AdminGroup[] | null;
}

interface RemoveApplicationPolicyFormProps {
  applicationId: string;
  applicationName: string;
  policyId: string;
  groupName: string;
  memberCount: number | null;
}

function RemoveApplicationPolicyForm({
  applicationId,
  applicationName,
  policyId,
  groupName,
  memberCount,
}: RemoveApplicationPolicyFormProps) {
  const actionWithTarget = removeApplicationPolicyAction.bind(null, applicationId, policyId);
  const [state, formAction, isPending] = useActionState(actionWithTarget, INITIAL_STATE);

  function confirmRemoval(event: FormEvent<HTMLFormElement>) {
    const affectedMembers =
      memberCount === null
        ? 'Seluruh anggota group akan dievaluasi ulang.'
        : `${memberCount} anggota group akan dievaluasi ulang.`;

    if (
      !window.confirm(
        `Hapus akses group ${groupName} ke ${applicationName}? ${affectedMembers} User yang kehilangan jalur ALLOW terakhir akan kehilangan central session dan seluruh access token aktifnya.`,
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmRemoval}>
      {state.error ? (
        <div
          className="mb-3 max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}
      <button
        className="h-9 cursor-pointer rounded-lg border border-red-200 bg-white px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-red-600/30 disabled:cursor-not-allowed disabled:text-red-300"
        type="submit"
        disabled={isPending}
      >
        {isPending ? 'Menghapus…' : 'Hapus akses'}
      </button>
    </form>
  );
}

export function ApplicationPolicyManager({
  applicationId,
  applicationName,
  policies,
  groups,
}: ApplicationPolicyManagerProps) {
  const policyGroupIds = new Set(policies.map(({ group }) => group.id));
  const availableGroups = groups?.filter(({ id }) => !policyGroupIds.has(id)) ?? [];
  const actionWithApplication = addApplicationPolicyAction.bind(null, applicationId);
  const [state, formAction, isPending] = useActionState(actionWithApplication, INITIAL_STATE);

  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {policies.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {policies.map(({ id, effect, group }) => {
              const groupDetails = groups?.find(({ id: groupId }) => groupId === group.id);
              const memberCount = groupDetails?.userGroups.length ?? null;

              return (
                <li
                  className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center"
                  key={id}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900">{group.name}</p>
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-800">
                        {effect}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      {group.description ?? 'Tanpa deskripsi.'}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      {memberCount === null
                        ? 'Jumlah anggota belum dapat dimuat.'
                        : `${memberCount} anggota akan dievaluasi saat policy dihapus.`}
                    </p>
                  </div>
                  <RemoveApplicationPolicyForm
                    applicationId={applicationId}
                    applicationName={applicationName}
                    policyId={id}
                    groupName={group.name}
                    memberCount={memberCount}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-7 text-center">
            <p className="font-semibold text-slate-700">Belum ada group yang diizinkan.</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Tanpa policy ALLOW, user tidak dapat mengakses application ini.
            </p>
          </div>
        )}
      </div>

      <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h4 className="font-bold text-slate-950">Izinkan group</h4>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Anggota group memperoleh jalur ALLOW ketika authorization berikutnya dievaluasi.
        </p>

        {groups === null ? (
          <div
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800"
            role="alert"
          >
            Katalog group belum dapat dimuat. Pastikan Auth Server aktif, lalu muat ulang halaman.
          </div>
        ) : groups.length === 0 ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">
            Belum ada group yang dapat dipakai.{' '}
            <Link className="font-bold underline" href="/admin/groups/new">
              Buat group
            </Link>{' '}
            terlebih dahulu.
          </div>
        ) : (
          <form action={formAction} className="mt-5">
            {state.error ? (
              <div
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800"
                role="alert"
              >
                {state.error}
              </div>
            ) : null}

            <label className="block text-sm font-bold text-slate-700" htmlFor="policy-group">
              Group tersedia
            </label>
            <select
              className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition focus:border-violet-600 focus:ring-3 focus:ring-violet-600/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              id="policy-group"
              name="groupId"
              defaultValue=""
              disabled={availableGroups.length === 0 || isPending}
              required
            >
              <option value="" disabled>
                {availableGroups.length > 0 ? 'Pilih group' : 'Semua group sudah diizinkan'}
              </option>
              {availableGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} · {group.userGroups.length} anggota
                </option>
              ))}
            </select>

            <button
              className="mt-4 h-11 w-full cursor-pointer rounded-lg bg-violet-700 px-4 font-bold text-white transition hover:bg-violet-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-violet-700/30 disabled:cursor-not-allowed disabled:bg-violet-300"
              type="submit"
              disabled={availableGroups.length === 0 || isPending}
            >
              {isPending ? 'Menyimpan…' : 'Izinkan group'}
            </button>
          </form>
        )}
      </aside>
    </div>
  );
}

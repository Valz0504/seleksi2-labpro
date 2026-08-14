'use client';

import type { FormEvent } from 'react';
import { useActionState } from 'react';
import type { AdminGroup, AdminUser } from '@/lib/admin-session';
import {
  addUserGroupAction,
  removeUserGroupAction,
  type UserMembershipActionState,
} from './actions';

const INITIAL_STATE: UserMembershipActionState = { error: null };

interface UserMembershipManagerProps {
  userId: string;
  memberships: AdminUser['userGroups'];
  groups: AdminGroup[] | null;
}

interface RemoveMembershipFormProps {
  userId: string;
  groupId: string;
  groupName: string;
}

function RemoveMembershipForm({ userId, groupId, groupName }: RemoveMembershipFormProps) {
  const actionWithTarget = removeUserGroupAction.bind(null, userId, groupId);
  const [state, formAction, isPending] = useActionState(actionWithTarget, INITIAL_STATE);

  function confirmRemoval(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Hapus user dari group ${groupName}? Jika ini jalur ALLOW terakhir, central session dan access token aktif user akan dicabut.`,
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} className="mt-4" onSubmit={confirmRemoval}>
      {state.error ? (
        <div
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800"
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
        {isPending ? 'Mengeluarkan…' : 'Keluarkan dari group'}
      </button>
    </form>
  );
}

export function UserMembershipManager({ userId, memberships, groups }: UserMembershipManagerProps) {
  const membershipGroupIds = new Set(memberships.map(({ group }) => group.id));
  const availableGroups = groups?.filter(({ id }) => !membershipGroupIds.has(id)) ?? [];
  const actionWithUser = addUserGroupAction.bind(null, userId);
  const [addState, addAction, isAdding] = useActionState(actionWithUser, INITIAL_STATE);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.75fr)]">
      <div>
        {memberships.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {memberships.map(({ id, group }) => {
              const groupDetails = groups?.find(({ id: groupId }) => groupId === group.id);

              return (
                <li className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={id}>
                  <h4 className="font-bold text-slate-950">{group.name}</h4>
                  <p className="mt-1 min-h-6 text-sm leading-6 text-slate-500">
                    {group.description ?? 'Tanpa deskripsi.'}
                  </p>

                  <div className="mt-4">
                    <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                      Jalur akses aplikasi
                    </p>
                    {groups === null ? (
                      <p className="mt-2 text-sm text-slate-500">
                        Detail policy belum dapat dimuat.
                      </p>
                    ) : groupDetails && groupDetails.policies.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {groupDetails.policies.map(({ id: policyId, application }) => (
                          <li
                            className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                              application.status === 'ACTIVE'
                                ? 'bg-blue-50 text-blue-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                            key={policyId}
                          >
                            {application.name}
                            {application.status === 'INACTIVE' ? ' · nonaktif' : ''}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        Group belum memiliki policy aplikasi.
                      </p>
                    )}
                  </div>

                  <RemoveMembershipForm userId={userId} groupId={group.id} groupName={group.name} />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
            <p className="font-semibold text-slate-700">User belum menjadi anggota group.</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Tambahkan group untuk memberikan jalur akses sesuai policy yang terhubung.
            </p>
          </div>
        )}
      </div>

      <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h4 className="font-bold text-slate-950">Tambahkan ke group</h4>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Policy group akan dievaluasi saat user memulai authorization berikutnya.
        </p>

        {groups === null ? (
          <div
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800"
            role="alert"
          >
            Katalog group belum dapat dimuat. Pastikan Auth Server aktif, lalu muat ulang halaman.
          </div>
        ) : (
          <form action={addAction} className="mt-5">
            {addState.error ? (
              <div
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800"
                role="alert"
              >
                {addState.error}
              </div>
            ) : null}

            <label className="block text-sm font-bold text-slate-700" htmlFor="membership-group">
              Group tersedia
            </label>
            <select
              className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
              id="membership-group"
              name="groupId"
              defaultValue=""
              disabled={availableGroups.length === 0 || isAdding}
              required
            >
              <option value="" disabled>
                {availableGroups.length > 0 ? 'Pilih group' : 'Semua group sudah ditambahkan'}
              </option>
              {availableGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>

            <button
              className="mt-4 h-11 w-full cursor-pointer rounded-lg bg-blue-600 px-4 font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30 disabled:cursor-not-allowed disabled:bg-blue-300"
              type="submit"
              disabled={availableGroups.length === 0 || isAdding}
            >
              {isAdding ? 'Menambahkan…' : 'Tambahkan ke group'}
            </button>
          </form>
        )}
      </aside>
    </div>
  );
}

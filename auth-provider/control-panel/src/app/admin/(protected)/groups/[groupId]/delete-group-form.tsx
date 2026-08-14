'use client';

import type { FormEvent } from 'react';
import { useActionState } from 'react';
import { deleteGroupAction, type DeleteGroupActionState } from './actions';

const INITIAL_STATE: DeleteGroupActionState = { error: null };

interface DeleteGroupFormProps {
  groupId: string;
  groupName: string;
  memberCount: number;
  policyCount: number;
  includesCurrentAdmin: boolean;
}

export function DeleteGroupForm({
  groupId,
  groupName,
  memberCount,
  policyCount,
  includesCurrentAdmin,
}: DeleteGroupFormProps) {
  const actionWithGroup = deleteGroupAction.bind(null, groupId);
  const [state, formAction, isPending] = useActionState(actionWithGroup, INITIAL_STATE);

  function confirmDeletion(event: FormEvent<HTMLFormElement>) {
    const impact = `${memberCount} keanggotaan dan ${policyCount} policy terkait ikut dihapus.`;
    const revocation =
      policyCount > 0
        ? ' User yang kehilangan jalur ALLOW terakhir akan mengalami revocation.'
        : '';

    if (!window.confirm(`Hapus group ${groupName} secara permanen? ${impact}${revocation}`)) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} className="mt-5" onSubmit={confirmDeletion}>
      {state.error ? (
        <div
          className="mb-4 rounded-lg border border-red-300 bg-white px-4 py-3 text-sm leading-6 text-red-800"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <div className="rounded-lg border border-red-200 bg-red-100/70 px-4 py-3 text-sm leading-6 text-red-950">
        {memberCount} keanggotaan dan {policyCount} policy akan ikut dihapus.
        {policyCount > 0
          ? ' Backend akan mengevaluasi ulang akses setiap anggota dan mencabut central session serta access token jika jalur ALLOW terakhir hilang.'
          : ''}
        {includesCurrentAdmin
          ? ' Akun admin yang sedang digunakan termasuk anggota group ini dan mungkin harus login ulang.'
          : ''}
      </div>

      <button
        className="mt-5 h-11 cursor-pointer rounded-lg bg-red-600 px-5 font-bold text-white transition hover:bg-red-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-red-600/30 disabled:cursor-not-allowed disabled:bg-red-300"
        type="submit"
        disabled={isPending}
      >
        {isPending ? 'Menghapus…' : 'Hapus group'}
      </button>
    </form>
  );
}

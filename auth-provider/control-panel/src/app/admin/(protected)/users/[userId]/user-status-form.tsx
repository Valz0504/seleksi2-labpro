'use client';

import type { FormEvent } from 'react';
import { useActionState } from 'react';
import { updateUserStatusAction, type UpdateUserStatusActionState } from './actions';

const INITIAL_STATE: UpdateUserStatusActionState = { error: null };

interface UserStatusFormProps {
  userId: string;
  status: 'ACTIVE' | 'INACTIVE';
  isCurrentUser: boolean;
}

export function UserStatusForm({ userId, status, isCurrentUser }: UserStatusFormProps) {
  const nextStatus = status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const actionWithTarget = updateUserStatusAction.bind(null, userId, nextStatus);
  const [state, formAction, isPending] = useActionState(actionWithTarget, INITIAL_STATE);
  const isDeactivation = nextStatus === 'INACTIVE';
  const selfDeactivationBlocked = isCurrentUser && isDeactivation;

  function confirmStatusChange(event: FormEvent<HTMLFormElement>) {
    const message = isDeactivation
      ? 'Nonaktifkan user dan cabut seluruh central session serta access token aktifnya?'
      : 'Aktifkan kembali user? Session dan token lama tetap tidak akan berlaku.';

    if (!window.confirm(message)) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmStatusChange}>
      {state.error ? (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <div
        className={`rounded-lg border px-4 py-3 text-sm leading-6 ${
          isDeactivation
            ? 'border-red-200 bg-red-50 text-red-900'
            : 'border-green-200 bg-green-50 text-green-900'
        }`}
      >
        {isDeactivation
          ? 'Menonaktifkan user akan langsung mencabut seluruh central session dan access token aktifnya.'
          : 'Mengaktifkan user tidak memulihkan session atau token lama. User harus login kembali.'}
      </div>

      {selfDeactivationBlocked ? (
        <p className="mt-4 text-sm font-semibold text-slate-600">
          Kamu sedang memakai akun ini. Self-deactivation diblokir untuk mencegah lockout.
        </p>
      ) : null}

      <button
        className={`mt-5 h-11 cursor-pointer rounded-lg px-5 font-bold text-white transition focus-visible:outline-3 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${
          isDeactivation
            ? 'bg-red-600 hover:bg-red-700 focus-visible:outline-red-600/30 disabled:bg-red-300'
            : 'bg-green-700 hover:bg-green-800 focus-visible:outline-green-700/30 disabled:bg-green-400'
        }`}
        type="submit"
        disabled={isPending || selfDeactivationBlocked}
      >
        {isPending ? 'Menyimpan…' : isDeactivation ? 'Nonaktifkan pengguna' : 'Aktifkan pengguna'}
      </button>
    </form>
  );
}

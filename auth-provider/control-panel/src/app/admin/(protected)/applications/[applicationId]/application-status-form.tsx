'use client';

import type { FormEvent } from 'react';
import { useActionState } from 'react';
import { updateApplicationStatusAction, type UpdateApplicationStatusActionState } from './actions';

const INITIAL_STATE: UpdateApplicationStatusActionState = { error: null };

interface ApplicationStatusFormProps {
  applicationId: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export function ApplicationStatusForm({ applicationId, status }: ApplicationStatusFormProps) {
  const nextStatus = status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const actionWithTarget = updateApplicationStatusAction.bind(null, applicationId, nextStatus);
  const [state, formAction, isPending] = useActionState(actionWithTarget, INITIAL_STATE);
  const isDeactivation = nextStatus === 'INACTIVE';

  function confirmStatusChange(event: FormEvent<HTMLFormElement>) {
    const message = isDeactivation
      ? 'Nonaktifkan application? Authorization dan token exchange baru akan ditolak, serta seluruh access token aktif untuk application ini dicabut.'
      : 'Aktifkan kembali application? Access token lama tetap tidak berlaku dan client harus memulai authorization baru.';

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
            ? 'border-red-200 bg-red-50 text-red-950'
            : 'border-green-200 bg-green-50 text-green-950'
        }`}
      >
        {isDeactivation
          ? 'Application nonaktif tidak dapat memulai authorization atau menukar code. Access token aktif untuk audience ini dicabut, tetapi central session user tetap berlaku untuk application lain.'
          : 'Aktivasi tidak memulihkan access token lama. Client harus menjalankan Authorization Code Flow baru.'}
      </div>

      <button
        className={`mt-5 h-11 cursor-pointer rounded-lg px-5 font-bold text-white transition focus-visible:outline-3 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${
          isDeactivation
            ? 'bg-red-600 hover:bg-red-700 focus-visible:outline-red-600/30 disabled:bg-red-300'
            : 'bg-green-700 hover:bg-green-800 focus-visible:outline-green-700/30 disabled:bg-green-400'
        }`}
        type="submit"
        disabled={isPending}
      >
        {isPending
          ? 'Menyimpan…'
          : isDeactivation
            ? 'Nonaktifkan application'
            : 'Aktifkan application'}
      </button>
    </form>
  );
}

'use client';

import { useActionState } from 'react';
import { createGroupAction, type CreateGroupActionState } from './actions';

const INITIAL_STATE: CreateGroupActionState = {
  error: null,
  fieldErrors: {},
};

interface FieldErrorProps {
  id: string;
  message?: string;
}

function FieldError({ id, message }: FieldErrorProps) {
  return message ? (
    <p className="mt-2 text-sm font-medium text-red-700" id={id}>
      {message}
    </p>
  ) : null;
}

export function CreateGroupForm() {
  const [state, formAction, isPending] = useActionState(createGroupAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="name">
          Nama group
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="name"
          name="name"
          type="text"
          autoComplete="off"
          aria-describedby={state.fieldErrors.name ? 'name-error name-help' : 'name-help'}
          aria-invalid={Boolean(state.fieldErrors.name)}
          maxLength={120}
          placeholder="students"
          required
          autoFocus
        />
        <p className="mt-2 text-sm text-slate-500" id="name-help">
          Nama harus unik, misalnya students atau app-c-users.
        </p>
        <FieldError id="name-error" message={state.fieldErrors.name} />
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="description">
          Deskripsi <span className="font-normal text-slate-400">(opsional)</span>
        </label>
        <textarea
          className="mt-2 min-h-32 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="description"
          name="description"
          aria-describedby={state.fieldErrors.description ? 'description-error' : undefined}
          aria-invalid={Boolean(state.fieldErrors.description)}
          maxLength={1000}
          placeholder="Jelaskan fungsi atau cakupan akses group ini."
        />
        <FieldError id="description-error" message={state.fieldErrors.description} />
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
        Group baru belum memiliki anggota atau akses aplikasi. Pengguna dapat dimasukkan melalui
        halaman detail pengguna.
      </div>

      <button
        className="h-11 w-full cursor-pointer rounded-lg bg-blue-600 px-4 font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30 disabled:cursor-not-allowed disabled:bg-blue-400"
        type="submit"
        disabled={isPending}
      >
        {isPending ? 'Menyimpan…' : 'Buat group'}
      </button>
    </form>
  );
}

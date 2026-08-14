'use client';

import { useActionState } from 'react';
import { updateUserAction, type UpdateUserActionState } from './actions';

const INITIAL_STATE: UpdateUserActionState = {
  error: null,
  fieldErrors: {},
};

interface UpdateUserFormProps {
  userId: string;
  name: string;
  email: string;
}

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

export function UpdateUserForm({ userId, name, email }: UpdateUserFormProps) {
  const updateUserWithId = updateUserAction.bind(null, userId);
  const [state, formAction, isPending] = useActionState(updateUserWithId, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-5">
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
          Nama
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          aria-describedby={state.fieldErrors.name ? 'name-error' : undefined}
          aria-invalid={Boolean(state.fieldErrors.name)}
          defaultValue={name}
          maxLength={120}
          required
        />
        <FieldError id="name-error" message={state.fieldErrors.name} />
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="email">
          Email
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          aria-describedby={state.fieldErrors.email ? 'email-error' : undefined}
          aria-invalid={Boolean(state.fieldErrors.email)}
          defaultValue={email}
          maxLength={320}
          required
        />
        <FieldError id="email-error" message={state.fieldErrors.email} />
      </div>

      <button
        className="h-11 cursor-pointer rounded-lg bg-blue-600 px-5 font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30 disabled:cursor-not-allowed disabled:bg-blue-400"
        type="submit"
        disabled={isPending}
      >
        {isPending ? 'Menyimpan…' : 'Simpan perubahan'}
      </button>
    </form>
  );
}

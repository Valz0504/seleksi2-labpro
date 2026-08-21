'use client';

import { useActionState } from 'react';
import { createUserAction, type CreateUserActionState } from './actions';

const INITIAL_STATE: CreateUserActionState = {
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

export function CreateUserForm() {
  const [state, formAction, isPending] = useActionState(createUserAction, INITIAL_STATE);

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
          Nama
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          aria-describedby={state.fieldErrors.name ? 'name-error' : undefined}
          aria-invalid={Boolean(state.fieldErrors.name)}
          maxLength={120}
          placeholder="Nama pengguna"
          required
          autoFocus
        />
        <FieldError id="name-error" message={state.fieldErrors.name} />
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="email">
          Email
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          aria-describedby={state.fieldErrors.email ? 'email-error' : undefined}
          aria-invalid={Boolean(state.fieldErrors.email)}
          maxLength={320}
          placeholder="user@example.com"
          required
        />
        <FieldError id="email-error" message={state.fieldErrors.email} />
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="password">
          Password awal
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-describedby={
            state.fieldErrors.password ? 'password-error password-help' : 'password-help'
          }
          aria-invalid={Boolean(state.fieldErrors.password)}
          minLength={8}
          maxLength={1024}
          required
        />
        <p className="mt-2 text-sm text-slate-500" id="password-help">
          Minimal 8 karakter. Password akan disimpan sebagai hash Argon2id.
        </p>
        <FieldError id="password-error" message={state.fieldErrors.password} />
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
        User baru otomatis berstatus aktif. Akses Control Panel dan App A/B diberikan melalui group
        pada bagian keanggotaan group.
      </div>

      <button
        className="h-11 w-full cursor-pointer rounded-lg bg-blue-600 px-4 font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30 disabled:cursor-not-allowed disabled:bg-blue-400"
        type="submit"
        disabled={isPending}
      >
        {isPending ? 'Menyimpan…' : 'Buat pengguna'}
      </button>
    </form>
  );
}

'use client';

import type { FormEvent } from 'react';
import { useActionState } from 'react';
import { updateUserPasswordAction, type UpdateUserPasswordActionState } from './actions';

const INITIAL_STATE: UpdateUserPasswordActionState = {
  error: null,
  fieldErrors: {},
};

interface UpdatePasswordFormProps {
  userId: string;
  isCurrentUser: boolean;
}

export function UpdatePasswordForm({ userId, isCurrentUser }: UpdatePasswordFormProps) {
  const actionWithTarget = updateUserPasswordAction.bind(null, userId);
  const [state, formAction, isPending] = useActionState(actionWithTarget, INITIAL_STATE);

  function confirmPasswordChange(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        'Ganti password dan cabut seluruh central session serta access token aktif user ini?',
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} className="space-y-5" onSubmit={confirmPasswordChange}>
      {state.error ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="new-password">
          Password baru
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-describedby={state.fieldErrors.password ? 'new-password-error' : undefined}
          aria-invalid={Boolean(state.fieldErrors.password)}
          minLength={8}
          maxLength={1024}
          required
        />
        {state.fieldErrors.password ? (
          <p className="mt-2 text-sm font-medium text-red-700" id="new-password-error">
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="confirm-password">
          Konfirmasi password baru
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-describedby={
            state.fieldErrors.confirmPassword ? 'confirm-password-error' : undefined
          }
          aria-invalid={Boolean(state.fieldErrors.confirmPassword)}
          minLength={8}
          maxLength={1024}
          required
        />
        {state.fieldErrors.confirmPassword ? (
          <p className="mt-2 text-sm font-medium text-red-700" id="confirm-password-error">
            {state.fieldErrors.confirmPassword}
          </p>
        ) : null}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        Semua central session dan access token aktif user akan dicabut. Password disimpan ulang
        sebagai hash Argon2id.
        {isCurrentUser ? ' Karena ini akunmu sendiri, kamu harus login kembali setelahnya.' : ''}
      </div>

      <button
        className="h-11 cursor-pointer rounded-lg bg-amber-600 px-5 font-bold text-white transition hover:bg-amber-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-600/30 disabled:cursor-not-allowed disabled:bg-amber-300"
        type="submit"
        disabled={isPending}
      >
        {isPending ? 'Mengganti…' : 'Ganti password'}
      </button>
    </form>
  );
}

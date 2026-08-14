'use client';

import type { FormEvent } from 'react';
import { useActionState } from 'react';
import type { AdminApplication } from '@/lib/admin-session';
import {
  addRedirectUriAction,
  removeRedirectUriAction,
  type RedirectUriActionState,
  type RemoveRedirectUriActionState,
} from './actions';

const ADD_INITIAL_STATE: RedirectUriActionState = {
  error: null,
  fieldErrors: {},
};
const REMOVE_INITIAL_STATE: RemoveRedirectUriActionState = { error: null };

interface RedirectUriManagerProps {
  applicationId: string;
  redirectUris: AdminApplication['redirectUris'];
}

interface RemoveRedirectUriFormProps {
  applicationId: string;
  redirectUriId: string;
  redirectUri: string;
  isLastRedirectUri: boolean;
}

function RemoveRedirectUriForm({
  applicationId,
  redirectUriId,
  redirectUri,
  isLastRedirectUri,
}: RemoveRedirectUriFormProps) {
  const actionWithTarget = removeRedirectUriAction.bind(null, applicationId, redirectUriId);
  const [state, formAction, isPending] = useActionState(actionWithTarget, REMOVE_INITIAL_STATE);

  function confirmRemoval(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Hapus redirect URI ${redirectUri}? Authorization code yang belum dipakai dan terikat pada URI ini akan langsung dibuat tidak berlaku.`,
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} onSubmit={confirmRemoval}>
      {state.error ? (
        <div
          className="mb-3 max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-sm leading-6 text-red-800"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}
      <button
        className="h-9 cursor-pointer rounded-lg border border-red-200 bg-white px-3 font-sans text-sm font-bold text-red-700 transition hover:bg-red-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-red-600/30 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
        type="submit"
        disabled={isLastRedirectUri || isPending}
        title={
          isLastRedirectUri ? 'Application wajib memiliki setidaknya satu redirect URI.' : undefined
        }
      >
        {isPending ? 'Menghapus…' : 'Hapus'}
      </button>
    </form>
  );
}

export function RedirectUriManager({ applicationId, redirectUris }: RedirectUriManagerProps) {
  const registeredRedirectUris = redirectUris.map(({ redirectUri }) => redirectUri);
  const actionWithApplication = addRedirectUriAction.bind(
    null,
    applicationId,
    registeredRedirectUris,
  );
  const [state, formAction, isPending] = useActionState(actionWithApplication, ADD_INITIAL_STATE);
  const hasReachedLimit = redirectUris.length >= 20;
  const isLastRedirectUri = redirectUris.length === 1;

  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {redirectUris.map(({ id, redirectUri }) => (
            <li
              className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center"
              key={id}
            >
              <code className="break-all text-sm leading-6 text-slate-700">{redirectUri}</code>
              <RemoveRedirectUriForm
                applicationId={applicationId}
                redirectUriId={id}
                redirectUri={redirectUri}
                isLastRedirectUri={isLastRedirectUri}
              />
            </li>
          ))}
        </ul>
        {isLastRedirectUri ? (
          <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm leading-6 text-amber-900">
            URI terakhir tidak dapat dihapus. Tambahkan URI pengganti terlebih dahulu.
          </p>
        ) : null}
      </div>

      <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h4 className="font-bold text-slate-950">Tambah redirect URI</h4>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Nilai harus cocok persis dengan <code>redirect_uri</code> pada authorization dan token
          exchange.
        </p>

        <form action={formAction} className="mt-5">
          {state.error ? (
            <div
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800"
              role="alert"
            >
              {state.error}
            </div>
          ) : null}

          <label className="block text-sm font-bold text-slate-700" htmlFor="redirect-uri">
            Callback URL
          </label>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            id="redirect-uri"
            name="redirectUri"
            type="url"
            placeholder="http://localhost:3002/auth/callback"
            maxLength={2048}
            aria-describedby={
              state.fieldErrors.redirectUri
                ? 'redirect-uri-error redirect-uri-help'
                : 'redirect-uri-help'
            }
            aria-invalid={Boolean(state.fieldErrors.redirectUri)}
            disabled={hasReachedLimit || isPending}
            required
          />
          <p className="mt-2 text-sm leading-6 text-slate-500" id="redirect-uri-help">
            Maksimal 20 URI. Fragment (#) dan credential di dalam URL tidak diperbolehkan.
          </p>
          {state.fieldErrors.redirectUri ? (
            <p className="mt-2 text-sm font-medium text-red-700" id="redirect-uri-error">
              {state.fieldErrors.redirectUri}
            </p>
          ) : null}

          <button
            className="mt-4 h-11 w-full cursor-pointer rounded-lg bg-blue-600 px-4 font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30 disabled:cursor-not-allowed disabled:bg-blue-300"
            type="submit"
            disabled={hasReachedLimit || isPending}
          >
            {isPending ? 'Menambahkan…' : 'Tambah redirect URI'}
          </button>
        </form>
      </aside>
    </div>
  );
}

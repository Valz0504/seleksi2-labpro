'use client';

import { useActionState, useState } from 'react';
import {
  createApplicationAction,
  type CreateApplicationActionState,
  type CreatedApplicationCredential,
} from './actions';

const INITIAL_STATE: CreateApplicationActionState = {
  error: null,
  fieldErrors: {},
  createdApplication: null,
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

function OneTimeCredential({ application }: { application: CreatedApplicationCredential }) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(application.clientSecret);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  return (
    <section aria-labelledby="credential-title">
      <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-green-950">
        <p className="text-sm font-bold">Application berhasil didaftarkan</p>
        <p className="mt-1 text-sm leading-6 text-green-900">
          Simpan client secret sekarang sebelum meninggalkan halaman ini.
        </p>
      </div>

      <div className="mt-6 rounded-xl border-2 border-amber-300 bg-amber-50 p-5 sm:p-6">
        <p className="text-xs font-bold tracking-widest text-amber-700 uppercase">
          Credential satu kali
        </p>
        <h3 className="mt-2 text-2xl font-bold text-amber-950" id="credential-title">
          Client secret
        </h3>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          Auth Provider hanya menyimpan hash. Secret mentah tidak dapat dibaca kembali setelah kamu
          meninggalkan halaman ini.
        </p>

        <dl className="mt-5 space-y-4 text-sm">
          <div>
            <dt className="font-semibold text-amber-800">Application</dt>
            <dd className="mt-1 font-bold text-slate-950">{application.name}</dd>
          </div>
          <div>
            <dt className="font-semibold text-amber-800">Client ID</dt>
            <dd className="mt-1 break-all font-mono text-slate-950">{application.clientId}</dd>
          </div>
          <div>
            <dt className="font-semibold text-amber-800">Redirect URI</dt>
            <dd className="mt-1">
              <ul className="space-y-1">
                {application.redirectUris.map((redirectUri) => (
                  <li className="break-all font-mono text-xs text-slate-800" key={redirectUri}>
                    {redirectUri}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>

        <label className="mt-5 block text-sm font-bold text-amber-900" htmlFor="client-secret">
          Client secret
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-amber-300 bg-white px-3 font-mono text-sm text-slate-950 outline-none focus:border-amber-600 focus:ring-3 focus:ring-amber-600/15"
          id="client-secret"
          type={isRevealed ? 'text' : 'password'}
          value={application.clientSecret}
          autoComplete="off"
          spellCheck={false}
          readOnly
        />

        <div className="mt-3 flex flex-wrap gap-3">
          <button
            className="h-10 cursor-pointer rounded-lg border border-amber-400 bg-white px-4 text-sm font-bold text-amber-900 hover:bg-amber-100"
            type="button"
            onClick={() => setIsRevealed((value) => !value)}
          >
            {isRevealed ? 'Sembunyikan' : 'Tampilkan'}
          </button>
          <button
            className="h-10 cursor-pointer rounded-lg bg-amber-600 px-4 text-sm font-bold text-white hover:bg-amber-700"
            type="button"
            onClick={copySecret}
          >
            Salin client secret
          </button>
        </div>
        {copyStatus === 'copied' ? (
          <p className="mt-3 text-sm font-semibold text-green-800" role="status">
            Client secret berhasil disalin.
          </p>
        ) : copyStatus === 'failed' ? (
          <p className="mt-3 text-sm font-semibold text-red-700" role="alert">
            Browser tidak mengizinkan clipboard. Tampilkan lalu salin secret secara manual.
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700"
          type="button"
          onClick={() => window.location.replace('/admin/applications?created=1')}
        >
          Selesai dan buka daftar
        </button>
        <button
          className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          type="button"
          onClick={() => window.location.replace('/admin/applications/new')}
        >
          Daftarkan application lain
        </button>
      </div>
    </section>
  );
}

export function CreateApplicationForm() {
  const [state, formAction, isPending] = useActionState(createApplicationAction, INITIAL_STATE);

  if (state.createdApplication) {
    return <OneTimeCredential application={state.createdApplication} />;
  }

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

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-bold text-slate-700" htmlFor="name">
            Nama application
          </label>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
            id="name"
            name="name"
            type="text"
            maxLength={120}
            placeholder="App C"
            aria-describedby={state.fieldErrors.name ? 'name-error' : undefined}
            aria-invalid={Boolean(state.fieldErrors.name)}
            required
            autoFocus
          />
          <FieldError id="name-error" message={state.fieldErrors.name} />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700" htmlFor="client-id">
            Client ID
          </label>
          <input
            className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
            id="client-id"
            name="clientId"
            type="text"
            minLength={3}
            maxLength={100}
            pattern="[A-Za-z0-9._~-]+"
            placeholder="app-c"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={state.fieldErrors.clientId ? 'client-id-error' : 'client-id-help'}
            aria-invalid={Boolean(state.fieldErrors.clientId)}
            required
          />
          <p className="mt-2 text-sm text-slate-500" id="client-id-help">
            Identifier publik yang unik dan tidak dapat diubah setelah didaftarkan.
          </p>
          <FieldError id="client-id-error" message={state.fieldErrors.clientId} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="redirect-uris">
          Exact redirect URI
        </label>
        <textarea
          className="mt-2 min-h-28 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-3 font-mono text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="redirect-uris"
          name="redirectUris"
          placeholder="http://localhost:4000/auth/callback"
          aria-describedby={
            state.fieldErrors.redirectUris
              ? 'redirect-uris-error redirect-uris-help'
              : 'redirect-uris-help'
          }
          aria-invalid={Boolean(state.fieldErrors.redirectUris)}
          spellCheck={false}
          required
        />
        <p className="mt-2 text-sm leading-6 text-slate-500" id="redirect-uris-help">
          Satu URL HTTP/HTTPS per baris, maksimal 20. Authorization hanya menerima kecocokan penuh,
          termasuk scheme, host, port, path, dan trailing slash.
        </p>
        <FieldError id="redirect-uris-error" message={state.fieldErrors.redirectUris} />
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="launch-url">
          Launch URL <span className="font-normal text-slate-400">(opsional)</span>
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="launch-url"
          name="launchUrl"
          type="url"
          maxLength={2048}
          placeholder="http://localhost:4000"
          aria-describedby={state.fieldErrors.launchUrl ? 'launch-url-error' : undefined}
          aria-invalid={Boolean(state.fieldErrors.launchUrl)}
        />
        <FieldError id="launch-url-error" message={state.fieldErrors.launchUrl} />
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="logout-notification-url">
          Logout notification URL
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="logout-notification-url"
          name="logoutNotificationUrl"
          type="url"
          maxLength={2048}
          placeholder="http://localhost:4000/internal/logout"
          aria-describedby={
            state.fieldErrors.logoutNotificationUrl
              ? 'logout-notification-url-error logout-notification-url-help'
              : 'logout-notification-url-help'
          }
          aria-invalid={Boolean(state.fieldErrors.logoutNotificationUrl)}
          required
        />
        <p className="mt-2 text-sm leading-6 text-slate-500" id="logout-notification-url-help">
          Endpoint internal wajib yang akan digunakan back-channel logout pada F05.
        </p>
        <FieldError
          id="logout-notification-url-error"
          message={state.fieldErrors.logoutNotificationUrl}
        />
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        Client secret acak akan dibuat oleh Auth Server dan hanya ditampilkan sekali setelah submit
        berhasil. Form ini tidak menerima atau mengirim client secret manual.
      </div>

      <button
        className="h-11 w-full cursor-pointer rounded-lg bg-blue-600 px-4 font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30 disabled:cursor-not-allowed disabled:bg-blue-400"
        type="submit"
        disabled={isPending}
      >
        {isPending ? 'Mendaftarkan…' : 'Daftarkan application'}
      </button>
    </form>
  );
}

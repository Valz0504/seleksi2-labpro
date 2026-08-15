'use client';

import type { FormEvent } from 'react';
import { useActionState, useState } from 'react';
import { rotateClientSecretAction, type RotateClientSecretActionState } from './actions';

const INITIAL_STATE: RotateClientSecretActionState = {
  error: null,
  credential: null,
};

interface RotateClientSecretFormProps {
  applicationId: string;
  applicationName: string;
  clientId: string;
}

interface OneTimeRotatedCredentialProps {
  applicationId: string;
  applicationName: string;
  clientId: string;
  clientSecret: string;
}

function OneTimeRotatedCredential({
  applicationId,
  applicationName,
  clientId,
  clientSecret,
}: OneTimeRotatedCredentialProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(clientSecret);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  function finishProvisioning() {
    window.location.replace(
      `/admin/applications/${encodeURIComponent(applicationId)}?credential=rotated`,
    );
  }

  return (
    <div>
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm leading-6 text-green-900">
        Client secret {applicationName} berhasil dirotasi. Secret lama langsung tidak berlaku.
      </div>

      <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
        <p className="text-xs font-bold tracking-widest text-amber-700 uppercase">
          Credential satu kali
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          Simpan secret baru sekarang. Auth Provider hanya menyimpan hash dan tidak dapat
          menampilkannya kembali setelah halaman ini ditinggalkan.
        </p>

        <p className="mt-4 text-xs font-bold tracking-wide text-amber-800 uppercase">Client ID</p>
        <p className="mt-1 break-all font-mono text-sm text-slate-950">{clientId}</p>

        <label className="mt-4 block text-sm font-bold text-amber-900" htmlFor="rotated-secret">
          Client secret baru
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-amber-300 bg-white px-3 font-mono text-sm text-slate-950 outline-none focus:border-amber-600 focus:ring-3 focus:ring-amber-600/15"
          id="rotated-secret"
          type={isRevealed ? 'text' : 'password'}
          value={clientSecret}
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
            Browser tidak mengizinkan clipboard. Tampilkan lalu salin secara manual.
          </p>
        ) : null}
      </div>

      <button
        className="mt-4 h-11 w-full cursor-pointer rounded-lg bg-slate-900 px-4 font-bold text-white transition hover:bg-slate-800"
        type="button"
        onClick={finishProvisioning}
      >
        Saya sudah menyimpan secret
      </button>
    </div>
  );
}

export function RotateClientSecretForm({
  applicationId,
  applicationName,
  clientId,
}: RotateClientSecretFormProps) {
  const actionWithApplication = rotateClientSecretAction.bind(null, applicationId);
  const [state, formAction, isPending] = useActionState(actionWithApplication, INITIAL_STATE);

  function confirmRotation(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Rotasi client secret ${applicationName}? Secret lama akan langsung ditolak dan konfigurasi backend application harus diperbarui dengan secret baru.`,
      )
    ) {
      event.preventDefault();
    }
  }

  if (state.credential) {
    return (
      <OneTimeRotatedCredential
        applicationId={applicationId}
        applicationName={applicationName}
        clientId={state.credential.clientId}
        clientSecret={state.credential.clientSecret}
      />
    );
  }

  return (
    <form action={formAction} onSubmit={confirmRotation}>
      <h3 className="font-bold text-slate-950">Client credential</h3>
      <p className="mt-3 text-xs font-bold tracking-wide text-slate-500 uppercase">Client ID</p>
      <p className="mt-1 break-all font-mono text-sm text-slate-900">{clientId}</p>
      <p className="mt-4 text-sm leading-6 text-slate-500">
        Client secret mentah tidak dapat dibaca. Rotasi menghasilkan secret acak baru dan mengganti
        hash lama secara atomik.
      </p>

      {state.error ? (
        <div
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-950">
        Secret lama langsung tidak valid. Access token yang sudah diterbitkan tetap mengikuti
        lifecycle-nya dan tidak dicabut hanya karena rotasi credential.
      </div>

      <button
        className="mt-4 h-10 w-full cursor-pointer rounded-lg border border-amber-300 bg-white px-4 text-sm font-bold text-amber-900 transition hover:bg-amber-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-amber-600/30 disabled:cursor-not-allowed disabled:text-amber-300"
        type="submit"
        disabled={isPending}
      >
        {isPending ? 'Merotasi…' : 'Rotasi client secret'}
      </button>
    </form>
  );
}

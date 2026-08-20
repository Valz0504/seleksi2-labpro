'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

interface MfaStatus {
  enabled: boolean;
  enrollmentPending: boolean;
  recoveryCodesRemaining: number;
}

interface EnrollmentDetails {
  manualKey: string;
  provisioningUri: string;
  qrCodeDataUrl: string;
}

interface MfaEnrollmentProps {
  initialStatus: MfaStatus;
}

type ManagementAction = 'regenerate' | 'disable';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEnrollment(value: unknown): EnrollmentDetails | null {
  if (
    !isRecord(value) ||
    typeof value.manualKey !== 'string' ||
    typeof value.provisioningUri !== 'string' ||
    !value.provisioningUri.startsWith('otpauth://totp/') ||
    typeof value.qrCodeDataUrl !== 'string' ||
    !value.qrCodeDataUrl.startsWith('data:image/png;base64,')
  ) {
    return null;
  }

  return {
    manualKey: value.manualKey,
    provisioningUri: value.provisioningUri,
    qrCodeDataUrl: value.qrCodeDataUrl,
  };
}

function readRecoveryCodes(value: unknown): string[] | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.recoveryCodes) ||
    value.recoveryCodes.length === 0 ||
    value.recoveryCodes.some(
      (code) =>
        typeof code !== 'string' || !/^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/.test(code),
    )
  ) {
    return null;
  }

  return value.recoveryCodes;
}

function readError(value: unknown): { code?: string; message: string } {
  if (isRecord(value) && isRecord(value.error)) {
    return {
      code: typeof value.error.code === 'string' ? value.error.code : undefined,
      message:
        typeof value.error.message === 'string'
          ? value.error.message
          : 'Pengaturan MFA belum dapat diproses. Silakan coba lagi.',
    };
  }

  return { message: 'Pengaturan MFA belum dapat diproses. Silakan coba lagi.' };
}

export function MfaEnrollment({ initialStatus }: MfaEnrollmentProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [enrollment, setEnrollment] = useState<EnrollmentDetails | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [managementAction, setManagementAction] = useState<ManagementAction | null>(null);
  const [password, setPassword] = useState('');
  const [factor, setFactor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startEnrollment(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/mfa/enrollment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const body = (await response.json()) as unknown;

      if (response.status === 401) {
        router.replace('/?security_notice=session_required');
        return;
      }
      if (!response.ok) {
        throw new Error(readError(body).message);
      }

      const details = readEnrollment(body);

      if (!details) {
        throw new Error('Respons enrollment MFA tidak valid.');
      }

      setEnrollment(details);
      setStatus({ enabled: false, enrollmentPending: true, recoveryCodesRemaining: 0 });
      setCode('');
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Enrollment MFA belum dapat diproses. Silakan coba lagi.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function confirmEnrollment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/mfa/enrollment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', code }),
      });
      const body = (await response.json()) as unknown;

      if (response.status === 401) {
        router.replace('/?security_notice=session_required');
        return;
      }
      if (!response.ok) {
        throw new Error(readError(body).message);
      }

      const newRecoveryCodes = readRecoveryCodes(body);

      if (!newRecoveryCodes) {
        throw new Error('Recovery code tidak diterima dari Auth Server.');
      }

      setEnrollment(null);
      setRecoveryCodes(newRecoveryCodes);
      setStatus({
        enabled: true,
        enrollmentPending: false,
        recoveryCodesRemaining: newRecoveryCodes.length,
      });
      setCode('');
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Kode belum dapat diverifikasi. Silakan coba lagi.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function manageMfa(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (
      managementAction === 'disable' &&
      !window.confirm('Nonaktifkan MFA? Login berikutnya hanya memerlukan password.')
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/mfa/enrollment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: managementAction, password, code: factor }),
      });
      const body = response.status === 204 ? null : ((await response.json()) as unknown);

      if (!response.ok) {
        const responseError = readError(body);

        if (responseError.code === 'INVALID_SESSION') {
          router.replace('/?security_notice=session_required');
          return;
        }

        throw new Error(responseError.message);
      }

      if (managementAction === 'regenerate') {
        const newRecoveryCodes = readRecoveryCodes(body);

        if (!newRecoveryCodes) {
          throw new Error('Recovery code baru tidak diterima dari Auth Server.');
        }

        setRecoveryCodes(newRecoveryCodes);
        setStatus((current) => ({
          ...current,
          recoveryCodesRemaining: newRecoveryCodes.length,
        }));
      } else {
        setStatus({ enabled: false, enrollmentPending: false, recoveryCodesRemaining: 0 });
      }

      setManagementAction(null);
      setPassword('');
      setFactor('');
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Pengaturan MFA belum dapat diproses. Silakan coba lagi.',
      );
    } finally {
      setLoading(false);
    }
  }

  if (recoveryCodes) {
    return (
      <section className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-6 shadow-sm sm:p-8">
        <h2 className="text-xl font-bold text-amber-950">Simpan recovery code sekarang</h2>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          Setiap kode hanya bisa dipakai sekali. Kode mentah ini tidak disimpan server dan tidak
          akan ditampilkan lagi setelah halaman ditutup.
        </p>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2">
          {recoveryCodes.map((recoveryCode) => (
            <li key={recoveryCode}>
              <code className="block rounded-lg border border-amber-200 bg-white px-4 py-2 font-mono font-semibold text-slate-950">
                {recoveryCode}
              </code>
            </li>
          ))}
        </ul>
        <button
          className="mt-6 cursor-pointer rounded-lg bg-amber-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-950"
          onClick={() => setRecoveryCodes(null)}
          type="button"
        >
          Saya sudah menyimpannya
        </button>
      </section>
    );
  }

  if (status.enabled) {
    return (
      <section className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
          <h2 className="text-xl font-bold text-emerald-950">MFA TOTP aktif</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-emerald-800">
          Login berikutnya memerlukan password dan kode authenticator atau recovery code. Recovery
          code tersisa: <strong>{status.recoveryCodesRemaining}</strong>.
        </p>

        {error ? (
          <div
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {managementAction ? (
          <form
            className="mt-6 rounded-xl border border-emerald-200 bg-white p-5"
            onSubmit={(event) => void manageMfa(event)}
          >
            <h3 className="font-bold text-slate-950">
              {managementAction === 'regenerate' ? 'Buat recovery code baru' : 'Nonaktifkan MFA'}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Konfirmasi dengan password saat ini dan satu kode authenticator atau recovery code.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                Password saat ini
                <input
                  autoComplete="current-password"
                  className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Kode MFA
                <input
                  autoComplete="one-time-code"
                  className="mt-2 h-11 w-full rounded-lg border border-slate-300 px-3 font-mono uppercase outline-none focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
                  maxLength={14}
                  onChange={(event) => setFactor(event.target.value.toUpperCase().slice(0, 14))}
                  placeholder="000000 atau XXXX-XXXX-XXXX"
                  required
                  value={factor}
                />
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className={`cursor-pointer rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                  managementAction === 'disable'
                    ? 'bg-red-700 hover:bg-red-800'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
                disabled={loading}
                type="submit"
              >
                {loading
                  ? 'Memproses…'
                  : managementAction === 'disable'
                    ? 'Nonaktifkan MFA'
                    : 'Ganti recovery code'}
              </button>
              <button
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                disabled={loading}
                onClick={() => {
                  setManagementAction(null);
                  setError(null);
                  setPassword('');
                  setFactor('');
                }}
                type="button"
              >
                Batal
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="cursor-pointer rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
              onClick={() => setManagementAction('regenerate')}
              type="button"
            >
              Buat recovery code baru
            </button>
            <button
              className="cursor-pointer rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
              onClick={() => setManagementAction('disable')}
              type="button"
            >
              Nonaktifkan MFA
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold text-slate-950">Hubungkan aplikasi authenticator</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Mulai enrollment, scan QR, lalu masukkan kode enam digit. MFA belum aktif sebelum kode
        pertama berhasil diverifikasi.
      </p>

      {error ? (
        <div
          className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {!enrollment ? (
        <div className="mt-6">
          {status.enrollmentPending ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              Enrollment sebelumnya belum selesai. Mulai ulang untuk mendapatkan QR baru.
            </p>
          ) : null}
          <button
            className="cursor-pointer rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onClick={() => void startEnrollment()}
            type="button"
          >
            {loading
              ? 'Menyiapkan…'
              : status.enrollmentPending
                ? 'Mulai ulang enrollment'
                : 'Mulai enrollment'}
          </button>
        </div>
      ) : (
        <div className="mt-7 grid gap-8 lg:grid-cols-[260px_1fr]">
          <div>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-2">
              <Image
                alt="QR code enrollment MFA"
                height={240}
                src={enrollment.qrCodeDataUrl}
                unoptimized
                width={240}
              />
            </div>
          </div>

          <div>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
              <li>Buka Google Authenticator, Authy, atau aplikasi TOTP lain.</li>
              <li>Scan QR di samping.</li>
              <li>Masukkan kode enam digit yang muncul.</li>
            </ol>

            <div className="mt-5 rounded-lg bg-slate-100 p-4">
              <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                Manual setup key
              </p>
              <code className="mt-2 block break-all font-mono text-sm font-semibold text-slate-900">
                {enrollment.manualKey}
              </code>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Jangan bagikan key ini. Gunakan hanya jika QR tidak dapat dipindai.
              </p>
            </div>

            <form className="mt-6" onSubmit={(event) => void confirmEnrollment(event)}>
              <label className="text-sm font-semibold text-slate-700" htmlFor="totp-code">
                Kode authenticator
              </label>
              <input
                autoComplete="one-time-code"
                autoFocus
                className="mt-2 h-11 w-full max-w-xs rounded-lg border border-slate-300 px-3 font-mono text-lg tracking-[0.3em] text-slate-950 outline-none focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
                id="totp-code"
                inputMode="numeric"
                maxLength={6}
                name="code"
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                pattern="\d{6}"
                required
                value={code}
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="cursor-pointer rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading || code.length !== 6}
                  type="submit"
                >
                  {loading ? 'Memverifikasi…' : 'Aktifkan MFA'}
                </button>
                <button
                  className="cursor-pointer rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  disabled={loading}
                  onClick={() => void startEnrollment()}
                  type="button"
                >
                  Buat QR baru
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

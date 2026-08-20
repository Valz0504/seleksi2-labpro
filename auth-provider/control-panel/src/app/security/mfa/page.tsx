import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildInternalAuthServerUrl } from '@/lib/auth-server-url';
import { getPublicSession } from '@/lib/public-session';
import { MfaEnrollment } from './mfa-enrollment';

interface MfaStatus {
  enabled: boolean;
  enrollmentPending: boolean;
}

function readMfaStatus(value: unknown): MfaStatus | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('enabled' in value) ||
    typeof value.enabled !== 'boolean' ||
    !('enrollmentPending' in value) ||
    typeof value.enrollmentPending !== 'boolean'
  ) {
    return null;
  }

  return {
    enabled: value.enabled,
    enrollmentPending: value.enrollmentPending,
  };
}

async function getMfaStatus(): Promise<MfaStatus | null> {
  try {
    const response = await fetch(buildInternalAuthServerUrl('/auth/mfa/status'), {
      headers: { cookie: (await cookies()).toString() },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return readMfaStatus((await response.json()) as unknown);
  } catch {
    return null;
  }
}

export default async function MfaSecurityPage() {
  const [sessionLookup, mfaStatus] = await Promise.all([getPublicSession(), getMfaStatus()]);

  if (sessionLookup.status === 'none') {
    redirect('/?security_notice=session_required');
  }

  if (sessionLookup.status !== 'active' || !mfaStatus) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <main className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-xl shadow-slate-900/5">
          <h1 className="text-2xl font-bold text-slate-950">Pengaturan MFA belum tersedia</h1>
          <p className="mt-3 leading-7 text-slate-600">
            Auth Server belum dapat dihubungi. Coba muat ulang setelah service kembali sehat.
          </p>
          <Link className="mt-5 inline-block font-semibold text-blue-700 hover:underline" href="/">
            Kembali ke halaman utama
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 sm:p-10">
      <main className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-xs font-bold tracking-widest text-blue-600 uppercase">
              Keamanan akun
            </span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              Multi-Factor Authentication
            </h1>
            <p className="mt-2 text-slate-600">
              Akun: <strong>{sessionLookup.session.user.email}</strong>
            </p>
          </div>
          <Link className="text-sm font-semibold text-blue-700 hover:underline" href="/">
            Kembali
          </Link>
        </div>

        <MfaEnrollment initialStatus={mfaStatus} />
      </main>
    </div>
  );
}

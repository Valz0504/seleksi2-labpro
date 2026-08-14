import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentAdminSession } from '@/lib/admin-session';
import { buildPublicAuthServerUrl } from '@/lib/auth-server-url';

interface ProtectedAdminLayoutProps {
  children: ReactNode;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

export default async function ProtectedAdminLayout({ children }: ProtectedAdminLayoutProps) {
  const currentSession = await getCurrentAdminSession();

  if (!currentSession) {
    redirect('/admin/login?error=session_required');
  }

  if (currentSession.user.role !== 'ADMIN') {
    redirect('/admin/login?error=admin_required');
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-blue-600 uppercase">
              Auth Provider
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-950">Control Panel Admin</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <p className="font-semibold text-slate-800">{currentSession.user.name}</p>
              <p className="text-slate-500">{currentSession.user.email}</p>
            </div>
            <form action={buildPublicAuthServerUrl('/auth/logout/admin')} method="post">
              <button
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30"
                type="submit"
              >
                Logout SSO
              </button>
            </form>
          </div>
        </div>

        <nav
          className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6"
          aria-label="Navigasi Control Panel"
        >
          <Link
            className="border-b-2 border-transparent px-3 py-3 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
            href="/admin"
          >
            Dashboard
          </Link>
          <Link
            className="border-b-2 border-transparent px-3 py-3 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
            href="/admin/users"
          >
            Pengguna
          </Link>
          <Link
            className="border-b-2 border-transparent px-3 py-3 text-sm font-semibold text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
            href="/admin/groups"
          >
            Group
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>

      <footer className="mx-auto max-w-6xl px-6 pb-8 text-sm text-slate-500">
        Central session aktif sampai {formatDate(currentSession.session.expiresAt)} WIB.
      </footer>
    </div>
  );
}

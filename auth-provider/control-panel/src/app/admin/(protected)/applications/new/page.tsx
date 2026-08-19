import Link from 'next/link';
import { CreateApplicationForm } from './create-application-form';

export default function CreateAdminApplicationPage() {
  return (
    <div className="max-w-3xl">
      <Link
        className="text-sm font-bold text-blue-700 hover:text-blue-800"
        href="/admin/applications"
      >
        ← Kembali ke daftar application
      </Link>

      <section className="mt-5">
        <p className="text-sm font-semibold text-blue-600">Application</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
          Daftarkan application
        </h2>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">
          Daftarkan confidential OAuth client beserta callback tepercaya dan endpoint back-channel
          logout-nya.
        </p>
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <CreateApplicationForm />
      </section>
    </div>
  );
}

import Link from 'next/link';
import { CreateGroupForm } from './create-group-form';

export default function CreateAdminGroupPage() {
  return (
    <div className="max-w-2xl">
      <Link className="text-sm font-bold text-blue-700 hover:text-blue-800" href="/admin/groups">
        ← Kembali ke daftar group
      </Link>

      <section className="mt-5">
        <p className="text-sm font-semibold text-blue-600">Group</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Tambah group</h2>
        <p className="mt-3 leading-7 text-slate-600">
          Buat kelompok baru yang dapat diisi pengguna dan dihubungkan dengan policy aplikasi.
        </p>
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <CreateGroupForm />
      </section>
    </div>
  );
}

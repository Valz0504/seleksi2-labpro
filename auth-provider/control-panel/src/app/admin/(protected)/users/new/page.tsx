import Link from 'next/link';
import { CreateUserForm } from './create-user-form';

export default function CreateAdminUserPage() {
  return (
    <div className="max-w-2xl">
      <Link className="text-sm font-bold text-blue-700 hover:text-blue-800" href="/admin/users">
        ← Kembali ke daftar pengguna
      </Link>

      <section className="mt-5">
        <p className="text-sm font-semibold text-blue-600">Pengguna</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Tambah pengguna</h2>
        <p className="mt-3 leading-7 text-slate-600">
          Buat identitas baru yang nantinya dapat dimasukkan ke satu atau lebih group akses.
        </p>
      </section>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <CreateUserForm />
      </section>
    </div>
  );
}

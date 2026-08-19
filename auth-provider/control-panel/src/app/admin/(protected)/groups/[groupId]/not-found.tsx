import Link from 'next/link';

export default function GroupNotFound() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-blue-600">Group</p>
      <h2 className="mt-2 text-2xl font-bold text-slate-950">Group tidak ditemukan</h2>
      <p className="mt-3 text-slate-600">ID group tidak terdaftar pada Auth Provider.</p>
      <Link
        className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700"
        href="/admin/groups"
      >
        Kembali ke daftar group
      </Link>
    </section>
  );
}

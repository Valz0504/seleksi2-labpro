import Link from 'next/link';
import { getAdminOverview } from '@/lib/admin-session';

interface SummaryCardProps {
  label: string;
  value: number | null;
  description: string;
  href?: string;
}

function SummaryCard({ label, value, description, href }: SummaryCardProps) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value ?? '—'}</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
      {href ? (
        <Link
          className="mt-4 inline-flex text-sm font-bold text-blue-700 hover:text-blue-800"
          href={href}
        >
          Lihat daftar →
        </Link>
      ) : null}
    </article>
  );
}

export default async function AdminDashboardPage() {
  const overview = await getAdminOverview();

  return (
    <>
      <section>
        <p className="text-sm font-semibold text-blue-600">Dashboard</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
          Ringkasan Auth Provider
        </h2>
        <p className="mt-3 max-w-2xl leading-7 text-slate-600">
          Data berikut dibaca dari API admin menggunakan central session yang sudah divalidasi.
        </p>
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-3">
        <SummaryCard
          label="User"
          value={overview.users}
          description="Akun yang dikelola oleh Auth Provider."
          href="/admin/users"
        />
        <SummaryCard
          label="Group"
          value={overview.groups}
          description="Group yang dapat dihubungkan dengan user dan policy."
        />
        <SummaryCard
          label="Application"
          value={overview.applications}
          description="OAuth client yang terdaftar pada Auth Provider."
        />
      </section>
    </>
  );
}

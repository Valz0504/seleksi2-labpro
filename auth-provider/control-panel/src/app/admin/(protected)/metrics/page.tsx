import { getAdminMetrics } from '@/lib/admin-metrics';
import { MetricsDashboard } from './metrics-dashboard';

export default async function AdminMetricsPage() {
  const result = await getAdminMetrics();

  return (
    <>
      <section>
        <p className="text-sm font-semibold text-blue-600">Observability</p>
        <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Metrics sistem</h2>
        <p className="mt-3 max-w-3xl leading-7 text-slate-600">
          Kondisi Auth Server, event processing, dan RabbitMQ. Data diperbarui otomatis setiap lima
          detik dari snapshot agregat yang dilindungi sesi administrator.
        </p>
      </section>

      <MetricsDashboard initialSnapshot={result.status === 'success' ? result.snapshot : null} />
    </>
  );
}

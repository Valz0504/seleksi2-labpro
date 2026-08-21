'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminMetricsSnapshot } from '@/lib/admin-metrics';

interface MetricsDashboardProps {
  initialSnapshot: AdminMetricsSnapshot | null;
}

interface MetricCardProps {
  label: string;
  value: string;
  description: string;
  tone?: 'default' | 'danger' | 'warning';
}

interface Rates {
  errorsPerMinute: number;
  requestsPerMinute: number;
}

const REFRESH_INTERVAL_MS = 5_000;

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits }).format(value);
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value));
}

function MetricCard({ label, value, description, tone = 'default' }: MetricCardProps) {
  const valueColor =
    tone === 'danger' ? 'text-red-700' : tone === 'warning' ? 'text-amber-700' : 'text-slate-950';

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className={`mt-2 text-3xl font-bold tracking-tight ${valueColor}`}>{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </article>
  );
}

function DependencyStatus({ label, up }: { label: string; up: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3">
      <span className="font-semibold text-slate-700">{label}</span>
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
          up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${up ? 'bg-emerald-500' : 'bg-red-500'}`} />
        {up ? 'Terhubung' : 'Tidak tersedia'}
      </span>
    </div>
  );
}

export function MetricsDashboard({ initialSnapshot }: MetricsDashboardProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [rates, setRates] = useState<Rates | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(
    initialSnapshot ? null : 'Snapshot awal belum tersedia.',
  );
  const previousSample = useRef<{
    snapshot: AdminMetricsSnapshot;
    receivedAt: number;
  } | null>(null);
  const refreshInProgress = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshInProgress.current) {
      return;
    }

    refreshInProgress.current = true;
    setRefreshing(true);

    try {
      const response = await fetch('/api/admin/metrics', { cache: 'no-store' });

      if (response.status === 401) {
        router.replace('/admin/login?error=session_required');
        return;
      }

      if (response.status === 403) {
        router.replace('/admin/login?error=admin_required');
        return;
      }

      if (!response.ok) {
        throw new Error('metrics unavailable');
      }

      const nextSnapshot = (await response.json()) as AdminMetricsSnapshot;
      const receivedAt = Date.now();
      const previous = previousSample.current;

      if (previous) {
        const elapsedMinutes = Math.max((receivedAt - previous.receivedAt) / 60_000, 1 / 60);

        setRates({
          requestsPerMinute:
            Math.max(nextSnapshot.http.requests - previous.snapshot.http.requests, 0) /
            elapsedMinutes,
          errorsPerMinute:
            Math.max(nextSnapshot.http.errors - previous.snapshot.http.errors, 0) / elapsedMinutes,
        });
      }

      previousSample.current = { snapshot: nextSnapshot, receivedAt };
      setSnapshot(nextSnapshot);
      setRefreshError(null);
    } catch {
      setRefreshError('Pembaruan terakhir gagal. Angka sebelumnya tetap ditampilkan.');
    } finally {
      refreshInProgress.current = false;
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    if (!previousSample.current && initialSnapshot) {
      previousSample.current = {
        snapshot: initialSnapshot,
        receivedAt: Date.now(),
      };
    }

    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [initialSnapshot, refresh]);

  if (!snapshot) {
    return (
      <section className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6" aria-live="polite">
        <h3 className="font-bold text-red-950">Metrics belum tersedia</h3>
        <p className="mt-2 text-sm leading-6 text-red-800">
          Pastikan Auth Server, Primary Database, dan RabbitMQ aktif. Tidak ada detail internal yang
          ditampilkan pada kondisi gagal.
        </p>
        <button
          className="mt-4 cursor-pointer rounded-lg bg-red-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={refreshing}
          onClick={() => void refresh()}
          type="button"
        >
          {refreshing ? 'Memuat…' : 'Coba lagi'}
        </button>
      </section>
    );
  }

  const healthy =
    snapshot.dependencies.primaryDatabase === 1 &&
    snapshot.dependencies.rabbitmq === 1 &&
    snapshot.queues.mainConsumers > 0 &&
    snapshot.queues.deadLetterReady === 0 &&
    snapshot.deliveries.FAILED === 0;
  const errorPercentage =
    snapshot.http.requests === 0 ? 0 : (snapshot.http.errors / snapshot.http.requests) * 100;

  return (
    <div className="mt-8 space-y-6">
      <section
        className={`flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between ${
          healthy ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
        }`}
        aria-live="polite"
      >
        <div>
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${healthy ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
            <h3 className={`font-bold ${healthy ? 'text-emerald-950' : 'text-amber-950'}`}>
              {healthy ? 'Sistem operasional' : 'Perlu perhatian'}
            </h3>
          </div>
          <p className={`mt-2 text-sm ${healthy ? 'text-emerald-800' : 'text-amber-800'}`}>
            Snapshot terakhir: {formatTimestamp(snapshot.generatedAt)} WIB
          </p>
          {refreshError ? (
            <p className="mt-2 text-sm font-semibold text-red-700">{refreshError}</p>
          ) : null}
        </div>

        <button
          className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={refreshing}
          onClick={() => void refresh()}
          type="button"
        >
          {refreshing ? 'Memperbarui…' : 'Perbarui sekarang'}
        </button>
      </section>

      <section>
        <div>
          <h3 className="text-xl font-bold text-slate-950">HTTP RED</h3>
          <p className="mt-1 text-sm text-slate-500">
            Rate dihitung dari selisih counter antar-refresh. Latency adalah rata-rata sejak Auth
            Server terakhir dimulai.
          </p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Latency rata-rata"
            value={`${formatNumber(snapshot.http.averageDurationMs, 1)} ms`}
            description="Durasi rata-rata seluruh request Auth Server."
          />
          <MetricCard
            label="Request rate"
            value={rates ? `${formatNumber(rates.requestsPerMinute, 1)}/mnt` : 'Mengukur…'}
            description={`${formatNumber(snapshot.http.requests)} request sejak proses dimulai.`}
          />
          <MetricCard
            label="Error rate"
            value={rates ? `${formatNumber(rates.errorsPerMinute, 1)}/mnt` : 'Mengukur…'}
            description={`${formatNumber(snapshot.http.errors)} error (${formatNumber(errorPercentage, 1)}%).`}
            tone={snapshot.http.errors > 0 ? 'warning' : 'default'}
          />
          <MetricCard
            label="Main queue"
            value={formatNumber(snapshot.queues.mainReady)}
            description="Message siap diproses oleh Sync Worker."
            tone={snapshot.queues.mainReady > 0 ? 'warning' : 'default'}
          />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">Dependency</h3>
          <p className="mt-1 text-sm text-slate-500">Ketersediaan komponen utama Auth Provider.</p>
          <div className="mt-4 space-y-3">
            <DependencyStatus
              label="Primary Database"
              up={snapshot.dependencies.primaryDatabase === 1}
            />
            <DependencyStatus label="RabbitMQ" up={snapshot.dependencies.rabbitmq === 1} />
            <DependencyStatus label="Sync Worker consumer" up={snapshot.queues.mainConsumers > 0} />
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">Queue dan publisher</h3>
          <p className="mt-1 text-sm text-slate-500">
            Backlog aktual dan hasil publish proses ini.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-slate-50 p-4">
              <dt className="text-sm text-slate-500">Main queue</dt>
              <dd className="mt-1 text-2xl font-bold text-slate-950">
                {formatNumber(snapshot.queues.mainReady)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <dt className="text-sm text-slate-500">Dead-letter queue</dt>
              <dd
                className={`mt-1 text-2xl font-bold ${snapshot.queues.deadLetterReady > 0 ? 'text-red-700' : 'text-slate-950'}`}
              >
                {formatNumber(snapshot.queues.deadLetterReady)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <dt className="text-sm text-slate-500">Publish sukses</dt>
              <dd className="mt-1 text-2xl font-bold text-slate-950">
                {formatNumber(snapshot.outboxPublish.success)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-4">
              <dt className="text-sm text-slate-500">Publish gagal</dt>
              <dd
                className={`mt-1 text-2xl font-bold ${snapshot.outboxPublish.failure > 0 ? 'text-red-700' : 'text-slate-950'}`}
              >
                {formatNumber(snapshot.outboxPublish.failure)}
              </dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-950">Event processing</h3>
            <p className="mt-1 text-sm text-slate-500">
              Jumlah durable pada outbox dan delivery setiap aplikasi.
            </p>
          </div>
          <p className="text-sm text-slate-500">
            Outbox: {formatNumber(snapshot.outbox.PENDING)} pending ·{' '}
            {formatNumber(snapshot.outbox.PUBLISHED)} published
          </p>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(
            [
              ['PENDING', 'Pending'],
              ['PROCESSING', 'Processing'],
              ['SUCCEEDED', 'Succeeded'],
              ['RETRYING', 'Retrying'],
              ['FAILED', 'Failed'],
            ] as const
          ).map(([status, label]) => (
            <div className="rounded-lg border border-slate-200 p-4" key={status}>
              <dt className="text-xs font-bold tracking-wide text-slate-500 uppercase">{label}</dt>
              <dd
                className={`mt-2 text-2xl font-bold ${
                  (status === 'RETRYING' || status === 'FAILED') && snapshot.deliveries[status] > 0
                    ? 'text-red-700'
                    : 'text-slate-950'
                }`}
              >
                {formatNumber(snapshot.deliveries[status])}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">Aktivitas autentikasi</h3>
        <p className="mt-1 text-sm text-slate-500">
          Agregat durable dari audit log, tanpa email atau identifier pengguna.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['login:success', 'Login sukses'],
            ['login:failure', 'Login gagal'],
            ['authorize:denied', 'Akses ditolak'],
            ['token:issued', 'Token diterbitkan'],
          ].map(([key, label]) => (
            <div className="rounded-lg bg-slate-50 p-4" key={key}>
              <dt className="text-sm text-slate-500">{label}</dt>
              <dd className="mt-1 text-2xl font-bold text-slate-950">
                {formatNumber(snapshot.auth[key] ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

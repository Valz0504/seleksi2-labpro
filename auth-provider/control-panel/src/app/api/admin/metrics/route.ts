import { getAdminMetrics } from '@/lib/admin-metrics';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export async function GET(): Promise<Response> {
  const result = await getAdminMetrics();

  if (result.status === 'success') {
    return Response.json(result.snapshot, { headers: NO_STORE_HEADERS });
  }

  const status = result.status === 'unauthorized' ? 401 : result.status === 'forbidden' ? 403 : 503;

  return Response.json(
    {
      error: {
        code: 'METRICS_UNAVAILABLE',
        message: 'Metrics sistem belum dapat dibaca',
      },
    },
    { status, headers: NO_STORE_HEADERS },
  );
}

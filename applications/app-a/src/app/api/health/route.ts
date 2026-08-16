import { getLocalDatabase } from '@/src/lib/database/client';

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    await getLocalDatabase().$queryRaw`SELECT 1`;

    return Response.json({
      status: 'ok',
      service: 'app-a',
      dependencies: { localDatabase: 'ok' },
      timestamp,
    });
  } catch {
    return Response.json(
      {
        status: 'degraded',
        service: 'app-a',
        dependencies: { localDatabase: 'unavailable' },
        timestamp,
      },
      { status: 503 },
    );
  }
}

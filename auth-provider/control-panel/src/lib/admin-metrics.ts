import { fetchAdminApi } from './admin-api';

export interface AdminMetricsSnapshot {
  generatedAt: string;
  http: {
    requests: number;
    errors: number;
    averageDurationMs: number;
  };
  auth: Record<string, number>;
  outboxPublish: {
    failure: number;
    success: number;
  };
  dependencies: {
    primaryDatabase: 0 | 1;
    rabbitmq: 0 | 1;
  };
  outbox: {
    PENDING: number;
    PUBLISHED: number;
  };
  deliveries: {
    PENDING: number;
    PROCESSING: number;
    SUCCEEDED: number;
    RETRYING: number;
    FAILED: number;
  };
  queues: {
    mainReady: number;
    mainConsumers: number;
    deadLetterReady: number;
  };
}

export type AdminMetricsResult =
  | { status: 'success'; snapshot: AdminMetricsSnapshot }
  | { status: 'unauthorized' | 'forbidden' | 'unavailable' };

export async function getAdminMetrics(): Promise<AdminMetricsResult> {
  try {
    const response = await fetchAdminApi('/admin/metrics');

    if (response.status === 401) {
      return { status: 'unauthorized' };
    }

    if (response.status === 403) {
      return { status: 'forbidden' };
    }

    if (!response.ok) {
      return { status: 'unavailable' };
    }

    const body = (await response.json()) as unknown;

    if (
      typeof body !== 'object' ||
      body === null ||
      !('generatedAt' in body) ||
      typeof body.generatedAt !== 'string' ||
      !('http' in body) ||
      !('dependencies' in body) ||
      !('queues' in body)
    ) {
      return { status: 'unavailable' };
    }

    return { status: 'success', snapshot: body as AdminMetricsSnapshot };
  } catch {
    return { status: 'unavailable' };
  }
}

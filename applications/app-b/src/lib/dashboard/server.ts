import 'server-only';
import { getLocalDatabase } from '../database/client';
import {
  createLocalDashboardViewModel,
  DASHBOARD_RECORD_LIMIT,
  type LocalDashboardViewModel,
} from './view-model';

interface LocalDashboardIdentity {
  externalUserId: string;
  localSessionId: string;
}

export async function getLocalSessionDashboard(
  identity: LocalDashboardIdentity,
): Promise<LocalDashboardViewModel> {
  const database = getLocalDatabase();
  const [activityLogs, processedEvents] = await Promise.all([
    database.activityLog.findMany({
      where: {
        OR: [
          { externalUserId: identity.externalUserId },
          { localSessionId: identity.localSessionId },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: DASHBOARD_RECORD_LIMIT,
      select: {
        id: true,
        eventType: true,
        result: true,
        message: true,
        requestId: true,
        createdAt: true,
      },
    }),
    database.processedEvent.findMany({
      orderBy: [{ processedAt: 'desc' }, { eventId: 'desc' }],
      take: DASHBOARD_RECORD_LIMIT,
      select: {
        eventId: true,
        eventType: true,
        processedAt: true,
        result: true,
      },
    }),
  ]);

  return createLocalDashboardViewModel({ activityLogs, processedEvents });
}

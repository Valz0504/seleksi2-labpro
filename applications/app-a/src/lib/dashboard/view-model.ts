export const DASHBOARD_RECORD_LIMIT = 20;

export interface DashboardActivityLogSource {
  id: string;
  eventType: string;
  result: string;
  message: string;
  requestId: string | null;
  createdAt: Date;
}

export interface DashboardProcessedEventSource {
  eventId: string;
  eventType: string;
  processedAt: Date;
  result: string;
}

export interface LocalDashboardViewModel {
  activityLogs: DashboardActivityLogSource[];
  processedEvents: DashboardProcessedEventSource[];
}

interface LocalDashboardSource {
  activityLogs: DashboardActivityLogSource[];
  processedEvents: DashboardProcessedEventSource[];
}

function compareNewestFirst(
  leftDate: Date,
  rightDate: Date,
  leftId: string,
  rightId: string,
): number {
  const timeDifference = rightDate.getTime() - leftDate.getTime();

  return timeDifference === 0 ? rightId.localeCompare(leftId) : timeDifference;
}

export function createLocalDashboardViewModel(
  source: LocalDashboardSource,
): LocalDashboardViewModel {
  return {
    activityLogs: [...source.activityLogs]
      .sort((left, right) => compareNewestFirst(left.createdAt, right.createdAt, left.id, right.id))
      .slice(0, DASHBOARD_RECORD_LIMIT)
      .map(({ id, eventType, result, message, requestId, createdAt }) => ({
        id,
        eventType,
        result,
        message,
        requestId,
        createdAt,
      })),
    processedEvents: [...source.processedEvents]
      .sort((left, right) =>
        compareNewestFirst(left.processedAt, right.processedAt, left.eventId, right.eventId),
      )
      .slice(0, DASHBOARD_RECORD_LIMIT)
      .map(({ eventId, eventType, processedAt, result }) => ({
        eventId,
        eventType,
        processedAt,
        result,
      })),
  };
}

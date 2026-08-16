import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLocalDashboardViewModel, DASHBOARD_RECORD_LIMIT } from './view-model';

describe('App B local dashboard view model', () => {
  it('orders records deterministically and exposes only dashboard-safe fields', () => {
    const activityLogs = [
      {
        id: 'activity-a',
        eventType: 'LocalSessionCreated',
        result: 'SUCCESS',
        message: 'Local session dibuat',
        requestId: 'request-a',
        createdAt: new Date('2026-08-16T08:00:00.000Z'),
        metadata: { accessToken: 'must-not-be-exposed' },
      },
      {
        id: 'activity-b',
        eventType: 'UserInfoFetched',
        result: 'SUCCESS',
        message: 'Profil diperbarui',
        requestId: null,
        createdAt: new Date('2026-08-16T08:00:00.000Z'),
      },
    ];
    const processedEvents = [
      {
        eventId: 'event-a',
        eventType: 'SessionRevoked',
        processedAt: new Date('2026-08-16T07:00:00.000Z'),
        result: 'local session dicabut',
        payload: { internalSecret: 'must-not-be-exposed' },
      },
      {
        eventId: 'event-b',
        eventType: 'PasswordChanged',
        processedAt: new Date('2026-08-16T09:00:00.000Z'),
        result: 'tidak ada session aktif',
      },
    ];

    const dashboard = createLocalDashboardViewModel({ activityLogs, processedEvents });

    assert.deepEqual(
      dashboard.activityLogs.map((activity) => activity.id),
      ['activity-b', 'activity-a'],
    );
    assert.deepEqual(
      dashboard.processedEvents.map((event) => event.eventId),
      ['event-b', 'event-a'],
    );
    assert.deepEqual(Object.keys(dashboard.activityLogs[1]!).sort(), [
      'createdAt',
      'eventType',
      'id',
      'message',
      'requestId',
      'result',
    ]);
    assert.deepEqual(Object.keys(dashboard.processedEvents[1]!).sort(), [
      'eventId',
      'eventType',
      'processedAt',
      'result',
    ]);
    assert.equal(activityLogs[0]!.id, 'activity-a');
  });

  it('limits each dashboard collection and supports clear empty states', () => {
    const activityLogs = Array.from({ length: DASHBOARD_RECORD_LIMIT + 3 }, (_, index) => ({
      id: `activity-${index.toString().padStart(2, '0')}`,
      eventType: 'Event',
      result: 'SUCCESS',
      message: 'Activity',
      requestId: null,
      createdAt: new Date(Date.UTC(2026, 7, 16, 8, index)),
    }));
    const processedEvents = Array.from({ length: DASHBOARD_RECORD_LIMIT + 2 }, (_, index) => ({
      eventId: `event-${index.toString().padStart(2, '0')}`,
      eventType: 'SessionRevoked',
      result: 'processed',
      processedAt: new Date(Date.UTC(2026, 7, 16, 9, index)),
    }));

    const dashboard = createLocalDashboardViewModel({ activityLogs, processedEvents });

    assert.equal(dashboard.activityLogs.length, DASHBOARD_RECORD_LIMIT);
    assert.equal(dashboard.activityLogs[0]!.id, 'activity-22');
    assert.equal(dashboard.processedEvents.length, DASHBOARD_RECORD_LIMIT);
    assert.equal(dashboard.processedEvents[0]!.eventId, 'event-21');
    assert.deepEqual(createLocalDashboardViewModel({ activityLogs: [], processedEvents: [] }), {
      activityLogs: [],
      processedEvents: [],
    });
  });
});

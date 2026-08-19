import type { RevocationEvent } from '@seleksi/shared';
import { InternalLogoutClientService } from './internal-logout-client.service';

describe('InternalLogoutClientService', () => {
  const event: RevocationEvent = {
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: 'SessionRevoked',
    userId: '22222222-2222-4222-8222-222222222222',
    centralSessionId: '33333333-3333-4333-8333-333333333333',
    applicationId: null,
    reason: 'sso_logout',
    occurredAt: '2026-08-17T08:00:00.000Z',
    metadata: {},
  };
  const target = {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'App A',
    logoutNotificationUrl: 'http://localhost:3002/internal/logout',
  };
  const configService = {
    getOrThrow: jest.fn((name: string) => {
      if (name === 'SYNC_WORKER_CONSUMER_ENABLED') {
        return true;
      }

      return name === 'INTERNAL_SERVICE_SECRET' ? 'shared-secret-value' : 5_000;
    }),
    get: jest.fn((name: string): string | undefined =>
      name === 'INTERNAL_SERVICE_SECRET' ? 'shared-secret-value' : undefined,
    ),
  };
  let service: InternalLogoutClientService;

  beforeEach(() => {
    jest.restoreAllMocks();
    service = new InternalLogoutClientService(configService as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts the event using server-to-server authentication', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    await expect(service.deliver(target, event)).resolves.toBeUndefined();
    const [calledUrl, request] = fetchMock.mock.calls[0];
    const headers = new Headers(request?.headers);

    expect(calledUrl).toBe(target.logoutNotificationUrl);
    expect(request).toMatchObject({
      method: 'POST',
      redirect: 'manual',
      body: JSON.stringify(event),
    });
    expect(headers.get('Authorization')).toBe('Bearer shared-secret-value');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('turns non-success responses into safe delivery errors', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 503 }));

    await expect(service.deliver(target, event)).rejects.toThrow(
      'Internal logout endpoint returned HTTP 503',
    );
  });

  it('rewrites only the hostname for mixed host and Docker development', async () => {
    configService.get.mockImplementation((name: string) =>
      name === 'SYNC_WORKER_LOGOUT_HOST_OVERRIDE' ? 'localhost' : undefined,
    );
    service = new InternalLogoutClientService(configService as never);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    await service.deliver(
      {
        ...target,
        logoutNotificationUrl: 'http://app-a:3002/internal/logout',
      },
      event,
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://localhost:3002/internal/logout',
    );
  });

  it('rejects credential-bearing, redirected, or unexpected target URLs', async () => {
    await expect(
      service.deliver(
        {
          ...target,
          logoutNotificationUrl:
            'http://user:password@localhost:3002/internal/logout',
        },
        event,
      ),
    ).rejects.toThrow('Application logout notification URL is invalid');

    expect(jest.spyOn(global, 'fetch')).not.toHaveBeenCalled();
  });

  it('does not expose request URLs from network failures', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(
        new TypeError(
          'fetch failed for http://localhost:3002/internal/logout?secret=x',
          { cause: { code: 'ECONNREFUSED' } },
        ),
      );

    await expect(service.deliver(target, event)).rejects.toThrow(
      'Internal logout request failed (ECONNREFUSED)',
    );
  });
});

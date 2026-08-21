import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { SessionCookieService } from '../auth/session-cookie.service';
import type { AdminRequest } from './admin-request';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  const authService = { getCurrentSession: jest.fn() };
  const sessionCookieService = { read: jest.fn() };
  let request: AdminRequest;
  let context: ExecutionContext;
  let guard: AdminGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    request = { ip: '127.0.0.1' } as AdminRequest;
    context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
    guard = new AdminGuard(
      authService as unknown as AuthService,
      sessionCookieService as unknown as SessionCookieService,
    );
  });

  it('allows a Control Panel group member and attaches a safe actor context', async () => {
    sessionCookieService.read.mockReturnValue('raw-session-token');
    authService.getCurrentSession.mockResolvedValue({
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        canAccessControlPanel: true,
      },
      session: { id: '22222222-2222-4222-8222-222222222222' },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.adminActor).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      ipAddress: '127.0.0.1',
    });
  });

  it('rejects a request without a central-session cookie', async () => {
    sessionCookieService.read.mockReturnValue(null);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.getCurrentSession).not.toHaveBeenCalled();
  });

  it('rejects an authenticated user without Control Panel access', async () => {
    sessionCookieService.read.mockReturnValue('raw-session-token');
    authService.getCurrentSession.mockResolvedValue({
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        canAccessControlPanel: false,
      },
      session: { id: '22222222-2222-4222-8222-222222222222' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(request.adminActor).toBeUndefined();
  });
});

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { SessionCookieService } from '../auth/session-cookie.service';
import type { AdminRequest } from './admin-request';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookieService: SessionCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const sessionToken = this.sessionCookieService.read(request);

    if (!sessionToken) {
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_SESSION',
          message: 'Central session tidak ditemukan',
        },
      });
    }

    const currentSession =
      await this.authService.getCurrentSession(sessionToken);

    if (currentSession.user.role !== 'ADMIN') {
      throw new ForbiddenException({
        error: {
          code: 'ADMIN_ACCESS_REQUIRED',
          message: 'Akses administrator diperlukan',
        },
      });
    }

    request.adminActor = {
      userId: currentSession.user.id,
      sessionId: currentSession.session.id,
      ipAddress: request.ip?.slice(0, 45),
    };

    return true;
  }
}

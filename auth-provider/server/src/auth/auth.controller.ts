import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SessionCookieService } from './session-cookie.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookieService: SessionCookieService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      loginDto.email,
      loginDto.password,
      {
        ipAddress: request.ip?.slice(0, 45),
        userAgent: request.get('user-agent'),
      },
    );

    this.sessionCookieService.write(response, result.sessionToken);

    return {
      user: result.user,
      session: result.session,
    };
  }

  @Get('session')
  getCurrentSession(@Req() request: Request) {
    const sessionToken = this.requireSessionToken(request);

    return this.authService.getCurrentSession(sessionToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const sessionToken = this.sessionCookieService.read(request);

    if (sessionToken) {
      await this.authService.logout(sessionToken);
    }

    this.sessionCookieService.clear(response);
  }

  private requireSessionToken(request: Request): string {
    const sessionToken = this.sessionCookieService.read(request);

    if (!sessionToken) {
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_SESSION',
          message: 'Central session tidak ditemukan',
        },
      });
    }

    return sessionToken;
  }
}

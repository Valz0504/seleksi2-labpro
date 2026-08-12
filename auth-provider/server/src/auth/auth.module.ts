import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionCookieService } from './session-cookie.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionCookieService],
  exports: [AuthService, SessionCookieService],
})
export class AuthModule {}

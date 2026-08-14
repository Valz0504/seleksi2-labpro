import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FrontChannelLoginService } from './front-channel-login.service';
import { SessionCookieService } from './session-cookie.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, FrontChannelLoginService, SessionCookieService],
  exports: [AuthService, FrontChannelLoginService, SessionCookieService],
})
export class AuthModule {}

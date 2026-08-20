import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FrontChannelLoginService } from './front-channel-login.service';
import { SessionCookieService } from './session-cookie.service';
import { CentralSessionService } from './central-session.service';
import { MfaChallengeCookieService } from '../mfa/mfa-challenge-cookie.service';
import { MfaChallengeService } from '../mfa/mfa-challenge.service';
import { MfaSecretCryptoService } from '../mfa/mfa-secret-crypto.service';
import { TotpService } from '../mfa/totp.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    CentralSessionService,
    FrontChannelLoginService,
    SessionCookieService,
    MfaChallengeCookieService,
    MfaChallengeService,
    MfaSecretCryptoService,
    TotpService,
  ],
  exports: [AuthService, FrontChannelLoginService, SessionCookieService],
})
export class AuthModule {}

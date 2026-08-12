import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationController } from './authorization.controller';
import { AuthorizationService } from './authorization.service';
import { TokenController } from './token.controller';
import { TokenService } from './token.service';
import { UserInfoController } from './userinfo.controller';
import { UserInfoService } from './userinfo.service';

@Module({
  imports: [AuthModule],
  controllers: [AuthorizationController, TokenController, UserInfoController],
  providers: [AuthorizationService, TokenService, UserInfoService],
})
export class AuthorizationModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationController } from './authorization.controller';
import { AuthorizationService } from './authorization.service';
import { TokenController } from './token.controller';
import { TokenService } from './token.service';

@Module({
  imports: [AuthModule],
  controllers: [AuthorizationController, TokenController],
  providers: [AuthorizationService, TokenService],
})
export class AuthorizationModule {}

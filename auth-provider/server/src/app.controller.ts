import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      service: 'auth-server',
      message: 'Auth Provider Server is running',
    };
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'auth-server',
      timestamp: new Date().toISOString(),
    };
  }
}

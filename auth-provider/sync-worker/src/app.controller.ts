import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      service: 'sync-worker',
      message: 'Sync Worker is running',
    };
  }

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'sync-worker',
      timestamp: new Date().toISOString(),
    };
  }
}

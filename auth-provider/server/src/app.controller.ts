import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller()
@ApiTags('System')
export class AppController {
  @Get()
  @ApiOperation({ summary: 'Identify the Auth Provider service' })
  @ApiOkResponse({
    description: 'Service identity and readiness message.',
    schema: {
      example: {
        service: 'auth-server',
        message: 'Auth Provider Server is running',
      },
    },
  })
  root() {
    return {
      service: 'auth-server',
      message: 'Auth Provider Server is running',
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Check Auth Provider health' })
  @ApiOkResponse({
    description: 'The synchronous Auth Provider process is healthy.',
    schema: {
      example: {
        status: 'ok',
        service: 'auth-server',
        timestamp: '2026-08-15T08:00:00.000Z',
      },
    },
  })
  health() {
    return {
      status: 'ok',
      service: 'auth-server',
      timestamp: new Date().toISOString(),
    };
  }
}

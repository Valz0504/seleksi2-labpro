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
}

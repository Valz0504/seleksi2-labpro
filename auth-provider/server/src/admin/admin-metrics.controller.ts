import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthMetricsCollectorService } from '../metrics/auth-metrics-collector.service';
import { AdminGuard } from './admin.guard';

@Controller('admin/metrics')
@UseGuards(AdminGuard)
@ApiTags('Admin metrics')
@ApiCookieAuth('centralSession')
@ApiUnauthorizedResponse({ description: 'Central session is invalid.' })
@ApiForbiddenResponse({ description: 'Administrator role is required.' })
export class AdminMetricsController {
  constructor(private readonly collector: AuthMetricsCollectorService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read an aggregate observability snapshot' })
  @ApiOkResponse({
    description:
      'Safe aggregate HTTP, auth, outbox, delivery, dependency, and queue metrics.',
  })
  snapshot() {
    return this.collector.snapshot();
  }
}

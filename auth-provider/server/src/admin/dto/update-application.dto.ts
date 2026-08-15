import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const URL_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_tld: false,
};

export class UpdateApplicationDto {
  @ApiPropertyOptional({
    description: 'New human-readable application name.',
    example: 'Application A',
    minLength: 1,
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description:
      'New status. Deactivation blocks authorization/token issuance and revokes active audience tokens.',
    enum: ['ACTIVE', 'INACTIVE'],
    example: 'INACTIVE',
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';

  @ApiPropertyOptional({
    description: 'New launch URL. Send null to clear it.',
    example: 'http://localhost:3002',
    maxLength: 2048,
    nullable: true,
  })
  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(2048)
  launchUrl?: string | null;

  @ApiPropertyOptional({
    description: 'New internal back-channel logout endpoint.',
    example: 'http://app-a:3002/internal/logout',
    maxLength: 2048,
  })
  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(2048)
  logoutNotificationUrl?: string;
}

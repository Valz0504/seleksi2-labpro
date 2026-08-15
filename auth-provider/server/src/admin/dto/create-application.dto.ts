import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const URL_OPTIONS = {
  protocols: ['http', 'https'],
  require_protocol: true,
  require_tld: false,
};

export class CreateApplicationDto {
  @ApiProperty({
    description: 'Human-readable application name.',
    example: 'App A',
    minLength: 1,
    maxLength: 120,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    description: 'Unique OAuth client identifier.',
    example: 'app-a',
    minLength: 3,
    maxLength: 100,
    pattern: '^[A-Za-z0-9._~-]+$',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9._~-]+$/)
  clientId!: string;

  @ApiPropertyOptional({
    description:
      'Optional confidential client secret. Omit it to let the server generate a 256-bit opaque secret. The raw value is returned once.',
    example: 'replace-with-random-client-secret',
    minLength: 32,
    maxLength: 512,
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  clientSecret?: string;

  @ApiProperty({
    description: 'One to twenty unique exact-match callback URIs.',
    example: ['http://localhost:3002/auth/callback'],
    minItems: 1,
    maxItems: 20,
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUrl(URL_OPTIONS, { each: true })
  redirectUris!: string[];

  @ApiPropertyOptional({
    description: 'Optional browser-facing application launch URL.',
    example: 'http://localhost:3002',
    maxLength: 2048,
  })
  @IsOptional()
  @IsUrl(URL_OPTIONS)
  @MaxLength(2048)
  launchUrl?: string;

  @ApiProperty({
    description:
      'Internal endpoint that will receive back-channel revocation requests.',
    example: 'http://app-a:3002/internal/logout',
    maxLength: 2048,
  })
  @IsUrl(URL_OPTIONS)
  @MaxLength(2048)
  logoutNotificationUrl!: string;
}

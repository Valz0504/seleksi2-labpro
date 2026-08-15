import { IsUrl, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRedirectUriDto {
  @ApiProperty({
    description:
      'Exact HTTP(S) callback URI without credentials or a fragment.',
    example: 'http://localhost:3002/auth/callback',
    maxLength: 2048,
  })
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2048)
  redirectUri!: string;
}

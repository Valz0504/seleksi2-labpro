import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class MfaCodeDto {
  @ApiProperty({
    description: 'Current six-digit code from the enrolled authenticator.',
    example: '123456',
    pattern: '^\\d{6}$',
    writeOnly: true,
  })
  @Matches(/^\d{6}$/)
  code!: string;
}

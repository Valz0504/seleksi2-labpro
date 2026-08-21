import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class MfaCodeDto {
  @ApiProperty({
    description:
      'Current six-digit authenticator code or a one-time recovery code.',
    example: '123456',
    pattern: '^(?:\\d{6}|[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2})$',
    writeOnly: true,
  })
  @Matches(/^(?:\d{6}|[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2})$/i)
  code!: string;
}

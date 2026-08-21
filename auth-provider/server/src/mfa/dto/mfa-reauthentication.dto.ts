import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class MfaReauthenticationDto {
  @ApiProperty({
    description: 'Current account password.',
    writeOnly: true,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  password!: string;

  @ApiProperty({
    description:
      'Current six-digit authenticator code or an unused recovery code.',
    example: '123456',
    pattern: '^(?:\\d{6}|[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2})$',
    writeOnly: true,
  })
  @Matches(/^(?:\d{6}|[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2})$/i)
  code!: string;
}

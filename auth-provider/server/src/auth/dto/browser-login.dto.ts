import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BrowserLoginDto {
  @ApiProperty({
    description: 'User email used as the login identifier.',
    example: 'user@example.com',
    maxLength: 320,
  })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    description: 'User password submitted by the front-channel login form.',
    example: 'replace-with-user-password',
    minLength: 1,
    maxLength: 1024,
    writeOnly: true,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;

  @ApiProperty({
    description:
      'Relative /authorize path previously validated by the Auth Provider.',
    example:
      '/authorize?client_id=app-a&redirect_uri=http%3A%2F%2Flocalhost%3A3002%2Fauth%2Fcallback&response_type=code&state=example-state-123456&code_challenge=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge_method=S256',
    maxLength: 8192,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  returnTo!: string;
}

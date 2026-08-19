import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'User email used as the login identifier.',
    example: 'user@example.com',
    maxLength: 320,
  })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    description: 'User password. It is never returned or stored as plaintext.',
    example: 'replace-with-user-password',
    minLength: 1,
    maxLength: 1024,
    writeOnly: true,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  password!: string;
}

import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'Display name.',
    example: 'Example User',
    minLength: 1,
    maxLength: 120,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    description: 'Unique login email. The server normalizes it to lowercase.',
    example: 'user@example.com',
    maxLength: 320,
  })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    description: 'Initial password, hashed with Argon2id before persistence.',
    example: 'replace-with-initial-password',
    minLength: 8,
    maxLength: 1024,
    writeOnly: true,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  password!: string;
}

import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'New display name.',
    example: 'Updated User',
    minLength: 1,
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description: 'New unique login email.',
    example: 'updated.user@example.com',
    maxLength: 320,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;
}

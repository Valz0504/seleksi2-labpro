import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({
    description: 'Unique group name.',
    example: 'students',
    minLength: 1,
    maxLength: 120,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    description: 'Human-readable purpose of the group.',
    example: 'Student accounts allowed to use the academic application.',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserPasswordDto {
  @ApiProperty({
    description:
      'Replacement password. Changing it revokes all active central sessions and access tokens owned by the user.',
    example: 'replace-with-new-password',
    minLength: 8,
    maxLength: 1024,
    writeOnly: true,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  password!: string;
}

import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePolicyDto {
  @ApiProperty({
    description: 'Group that receives ALLOW access to the application.',
    example: '11111111-1111-4111-8111-111111111111',
    format: 'uuid',
  })
  @IsUUID()
  groupId!: string;
}

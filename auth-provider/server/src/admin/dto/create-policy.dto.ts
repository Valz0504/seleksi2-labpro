import { IsUUID } from 'class-validator';

export class CreatePolicyDto {
  @IsUUID()
  groupId!: string;
}

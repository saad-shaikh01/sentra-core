import { IsUUID } from 'class-validator';

export class AssignAppRoleDto {
  @IsUUID()
  appRoleId!: string;
}

import { IsUUID } from 'class-validator';

export class AssignAppRoleDto {
  @IsUUID('4')
  appRoleId!: string;
}

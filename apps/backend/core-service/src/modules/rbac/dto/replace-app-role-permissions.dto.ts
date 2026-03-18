import { IsArray, IsUUID } from 'class-validator';

export class ReplaceAppRolePermissionsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}

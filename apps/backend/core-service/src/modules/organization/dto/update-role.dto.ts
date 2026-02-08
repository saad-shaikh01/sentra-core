import { IsEnum } from 'class-validator';
import { UserRole } from '@sentra-core/types';

export class UpdateRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

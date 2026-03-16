import { SetMetadata } from '@nestjs/common';
export const PM_ROLES_KEY = 'pmRoles';
export const PmRoles = (...roles: string[]) => SetMetadata(PM_ROLES_KEY, roles);

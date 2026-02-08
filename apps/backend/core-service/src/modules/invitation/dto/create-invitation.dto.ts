import { IsEmail, IsEnum } from 'class-validator';
import { UserRole } from '@sentra-core/types';

export class CreateInvitationDto {
  @IsEmail()
  email: string;

  @IsEnum(UserRole)
  role: UserRole;
}

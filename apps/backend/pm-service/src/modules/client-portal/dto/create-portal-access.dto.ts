import { IsEmail, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';

export class CreatePortalAccessDto {
  @IsUUID('4')
  projectId!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

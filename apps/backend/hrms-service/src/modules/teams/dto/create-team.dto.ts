import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

enum LeadVisibilityMode {
  OWN_ONLY = 'OWN_ONLY',
  TEAM_UNASSIGNED_ONLY = 'TEAM_UNASSIGNED_ONLY',
  TEAM_ALL = 'TEAM_ALL',
}

export class CreateTeamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  typeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @IsEnum(LeadVisibilityMode)
  leadVisibilityMode?: LeadVisibilityMode;

  @IsOptional()
  @IsBoolean()
  allowMemberVisibility?: boolean;
}

import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

enum LeadVisibilityMode {
  OWN_ONLY = 'OWN_ONLY',
  TEAM_UNASSIGNED_ONLY = 'TEAM_UNASSIGNED_ONLY',
  TEAM_ALL = 'TEAM_ALL',
}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  typeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string | null;

  @IsOptional()
  @IsBoolean()
  allowMemberVisibility?: boolean;

  @IsOptional()
  @IsEnum(LeadVisibilityMode)
  leadVisibilityMode?: LeadVisibilityMode;
}

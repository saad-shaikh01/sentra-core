import { IsString, IsOptional, IsEmail, IsUrl, MaxLength, IsEnum, IsDateString, IsUUID, ValidateIf } from 'class-validator';
import { LeadStatus, LeadType, LeadSource } from '@sentra-core/types';

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsEnum(LeadType)
  leadType?: LeadType;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsDateString()
  leadDate?: string;

  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @IsOptional()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @ValidateIf((o) => o.teamId !== null)
  @IsUUID()
  teamId?: string | null;
}

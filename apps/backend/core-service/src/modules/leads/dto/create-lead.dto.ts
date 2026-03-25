import { IsString, IsOptional, IsUUID, IsEmail, IsUrl, MaxLength, IsEnum, IsDateString, ValidateIf } from 'class-validator';
import { LeadType, LeadSource } from '@sentra-core/types';

export class CreateLeadDto {
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
  @IsEnum(LeadType)
  leadType?: LeadType;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsDateString()
  leadDate?: string;

  @IsOptional()
  data?: Record<string, unknown>;

  @IsUUID()
  brandId: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @ValidateIf((o) => o.teamId !== null)
  @IsString()
  teamId?: string | null;
}

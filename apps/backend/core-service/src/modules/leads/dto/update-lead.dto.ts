import { IsString, IsOptional, IsEmail, IsUrl, MinLength, MaxLength, IsEnum, IsDateString } from 'class-validator';
import { LeadStatus } from '@sentra-core/types';

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
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
  @IsString()
  source?: string;

  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  @IsOptional()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  assignedToId?: string;
}

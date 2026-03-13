import {
  IsString,
  IsOptional,
  IsUUID,
  IsEmail,
  IsUrl,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { LeadSource, LeadType } from '@sentra-core/types';

export class CaptureLeadDto {
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

  @IsUUID()
  brandId: string;

  @IsOptional()
  data?: Record<string, unknown>;
}

import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { LeadSource, LeadType } from '@sentra-core/types';

export class UpdateGenericLeadWebhookDto {
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsEnum(LeadSource)
  defaultSource?: LeadSource;

  @IsOptional()
  @IsEnum(LeadType)
  defaultLeadType?: LeadType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

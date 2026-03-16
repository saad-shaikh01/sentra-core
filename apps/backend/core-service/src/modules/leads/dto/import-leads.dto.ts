import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { LeadSource, LeadType } from '@sentra-core/types';

export class ImportLeadsDto {
  @IsUUID()
  brandId: string;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsEnum(LeadType)
  leadType?: LeadType;
}

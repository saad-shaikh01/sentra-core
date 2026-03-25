import { IsOptional, IsString, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { LeadStatus, LeadType, LeadSource, LeadViewTab } from '@sentra-core/types';
import { PaginationQueryDto } from '../../../common';

export class QueryLeadsDto extends PaginationQueryDto {
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
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['my', 'collaborating', 'pool', 'team'])
  leadView?: LeadViewTab;
}

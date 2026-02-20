import { IsOptional, IsString, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { LeadStatus } from '@sentra-core/types';
import { PaginationQueryDto } from '../../../common';

export class QueryLeadsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

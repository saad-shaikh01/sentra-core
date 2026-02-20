import { IsOptional, IsString, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { SaleStatus } from '@sentra-core/types';
import { PaginationQueryDto } from '../../../common';

export class QuerySalesDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

import { IsOptional, IsEnum, IsUUID, IsDateString, IsString } from 'class-validator';
import { InvoiceStatus } from '@sentra-core/types';
import { PaginationQueryDto } from '../../../common';

export class QueryInvoicesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsUUID()
  saleId?: string;

  @IsOptional()
  @IsString()
  salesAgentId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsDateString()
  dueBefore?: string;

  @IsOptional()
  @IsDateString()
  dueAfter?: string;
}

import { IsOptional, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { InvoiceStatus } from '@sentra-core/types';
import { PaginationQueryDto } from '../../../common';

export class QueryInvoicesDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsUUID()
  saleId?: string;

  @IsOptional()
  @IsDateString()
  dueBefore?: string;

  @IsOptional()
  @IsDateString()
  dueAfter?: string;
}

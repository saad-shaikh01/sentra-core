import { IsString, IsOptional, IsNumber, IsEnum, IsUrl, Min } from 'class-validator';
import { SaleStatus } from '@sentra-core/types';

export class UpdateSaleDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  totalAmount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  contractUrl?: string;

  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;
}

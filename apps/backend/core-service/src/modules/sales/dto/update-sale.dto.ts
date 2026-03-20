import { IsString, IsOptional, IsNumber, IsEnum, IsUrl, IsUUID, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountType, SaleStatus, SaleType } from '@sentra-core/types';
import { SalePackageDto } from './sale-package.dto';

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

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountValue?: number | null;

  @IsOptional()
  @IsEnum(SaleType)
  saleType?: SaleType;

  @IsOptional()
  @IsUUID()
  salesAgentId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SalePackageDto)
  salePackage?: SalePackageDto;
}

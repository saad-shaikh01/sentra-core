import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsEnum,
  IsInt,
  IsUrl,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountType, PaymentPlanType, SaleStatus, SaleType } from '@sentra-core/types';
import { SalePackageDto } from './sale-package.dto';

export class SaleItemDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customPrice?: number;

  @IsOptional()
  @IsString()
  packageId?: string;

  @IsOptional()
  @IsString()
  packageName?: string;
}

export class CreateSaleDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

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
  @IsUrl()
  contractUrl?: string;

  @IsOptional()
  @IsEnum(PaymentPlanType)
  paymentPlan?: PaymentPlanType;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(60)
  installmentCount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items?: SaleItemDto[];

  @IsUUID()
  brandId: string;

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

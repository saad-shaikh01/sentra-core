import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, IsObject, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { GatewayType } from '@sentra-core/types';

export class OpaqueDataDto {
  @IsString()
  dataDescriptor: string;

  @IsString()
  dataValue: string;
}

export class ChargeSaleDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OpaqueDataDto)
  opaqueData?: OpaqueDataDto;

  // Stripe: Payment Method ID from Stripe.js (pm_xxx)
  @IsOptional()
  @IsString()
  stripePaymentMethodId?: string;

  // Explicit gateway override — if omitted, inferred from payload / sale record
  @IsOptional()
  @IsEnum(GatewayType)
  gateway?: GatewayType;
}

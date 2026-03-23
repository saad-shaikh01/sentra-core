import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class OpaqueDataDto {
  @IsString()
  dataDescriptor: string;

  @IsString()
  dataValue: string;
}

export class PayerDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class PublicPaymentDto {
  // Authorize.Net: tokenized card data from Accept.js
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OpaqueDataDto)
  opaqueData?: OpaqueDataDto;

  // Stripe: Payment Method ID from Stripe.js (pm_xxx)
  @IsOptional()
  @IsString()
  stripePaymentMethodId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PayerDto)
  payer?: PayerDto;
}

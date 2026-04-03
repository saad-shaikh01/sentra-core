import { IsString, IsNumber, IsEnum, Min, IsOptional, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { GatewayType } from '@sentra-core/types';
import { OpaqueDataDto } from './charge-sale.dto';

export class CreateSubscriptionDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(1)
  intervalLength: number;

  @IsEnum(['days', 'months'] as const)
  intervalUnit: 'days' | 'months';

  @IsString()
  startDate: string;

  @IsNumber()
  @Min(1)
  totalOccurrences: number;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OpaqueDataDto)
  opaqueData?: OpaqueDataDto;

  @IsOptional()
  @IsString()
  stripePaymentMethodId?: string;

  @IsOptional()
  @IsEnum(GatewayType)
  gateway?: GatewayType;
}

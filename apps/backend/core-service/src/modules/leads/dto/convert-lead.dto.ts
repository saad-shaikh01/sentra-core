import { IsString, IsEmail, IsOptional, IsNumber, IsEnum, IsUUID } from 'class-validator';
import { PaymentPlanType } from '@sentra-core/types';

export class ConvertLeadDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // Optional first-sale fields — if provided, a Sale is created immediately
  @IsOptional()
  @IsNumber()
  dealAmount?: number;

  @IsOptional()
  @IsEnum(PaymentPlanType)
  paymentPlan?: PaymentPlanType;

  @IsOptional()
  @IsUUID()
  brandId?: string; // Override brand for the sale (defaults to lead's brandId)

  @IsOptional()
  @IsUUID()
  upsellAgentId?: string;

  @IsOptional()
  @IsUUID()
  projectManagerId?: string;
}

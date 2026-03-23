import { IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class RecordManualPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  // External reference number (e.g. Billergenie payment ID, check number, wire transfer ref)
  @IsOptional()
  @IsString()
  externalRef?: string;

  // Required note explaining the payment source
  @IsString()
  @MinLength(5)
  note: string;
}

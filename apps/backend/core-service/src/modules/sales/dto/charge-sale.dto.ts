import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ChargeSaleDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;
}

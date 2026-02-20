import { IsString, IsOptional, IsUUID, IsNumber, IsDateString, Min } from 'class-validator';

export class CreateInvoiceDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsUUID()
  saleId: string;
}

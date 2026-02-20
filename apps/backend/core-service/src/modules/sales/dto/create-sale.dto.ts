import { IsString, IsOptional, IsUUID, IsNumber, Min } from 'class-validator';

export class CreateSaleDto {
  @IsNumber()
  @Min(0.01)
  totalAmount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID()
  clientId: string;

  @IsUUID()
  brandId: string;
}

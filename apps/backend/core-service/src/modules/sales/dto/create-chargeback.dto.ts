import { IsDateString, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateChargebackDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @MinLength(10)
  notes: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;

  @IsOptional()
  @IsDateString()
  chargebackDate?: string;
}

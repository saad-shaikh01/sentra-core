import { IsString, IsNumber, IsEnum, Min, IsOptional } from 'class-validator';

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
}

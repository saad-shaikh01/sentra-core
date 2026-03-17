import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export enum RefundType {
  FULL = 'FULL',
  PARTIAL = 'PARTIAL',
  MANUAL = 'MANUAL',
}

export class CreateRefundDto {
  @IsEnum(RefundType)
  type: RefundType;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  cardLastFour?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  note?: string;
}

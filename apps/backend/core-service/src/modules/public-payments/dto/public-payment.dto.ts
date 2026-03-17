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
  @IsObject()
  @ValidateNested()
  @Type(() => OpaqueDataDto)
  opaqueData: OpaqueDataDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PayerDto)
  payer?: PayerDto;
}

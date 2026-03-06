import { IsNumber, IsOptional, IsString, IsUUID, IsObject, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class OpaqueDataDto {
  @IsString()
  dataDescriptor: string;

  @IsString()
  dataValue: string;
}

export class ChargeSaleDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => OpaqueDataDto)
  opaqueData?: OpaqueDataDto;
}

import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsInt, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class SalePackageServiceDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class SalePackageDto {
  @IsOptional()
  @IsString()
  packageId?: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  contentHtml?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePackageServiceDto)
  services: SalePackageServiceDto[];
}

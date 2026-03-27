import {
  IsString, IsOptional, IsUUID, IsBoolean, IsArray,
  IsNumber, IsEnum, IsInt, ValidateNested, MinLength, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PackageCategory } from '@sentra-core/types';

export class PackageItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class PackageServiceDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreatePackageDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  contentHtml?: string;

  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(PackageCategory)
  category?: PackageCategory;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageItemDto)
  items?: PackageItemDto[];
}

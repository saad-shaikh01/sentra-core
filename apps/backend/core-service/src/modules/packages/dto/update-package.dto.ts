import {
  IsString, IsOptional, IsUUID, IsBoolean, IsArray,
  IsNumber, IsEnum, ValidateNested, MinLength, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PackageCategory } from '@sentra-core/types';
import { PackageItemDto } from './create-package.dto';

export class UpdatePackageDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

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

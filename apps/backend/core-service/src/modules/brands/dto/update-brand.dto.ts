import { IsString, IsOptional, IsUrl, MinLength, MaxLength } from 'class-validator';

export class UpdateBrandDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  colors?: Record<string, string>;
}

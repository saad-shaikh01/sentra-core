import {
  IsString,
  IsOptional,
  IsUUID,
  IsEmail,
  IsUrl,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CaptureLeadDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  source: string;

  @IsUUID()
  brandId: string;

  @IsOptional()
  data?: Record<string, unknown>;
}

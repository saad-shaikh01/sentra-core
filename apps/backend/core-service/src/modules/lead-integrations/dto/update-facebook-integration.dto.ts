import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class UpdateFacebookIntegrationDto {
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  pageId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  formId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  accessToken?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateFacebookIntegrationDto {
  @IsUUID()
  brandId: string;

  @IsString()
  @MinLength(1)
  pageId: string;

  @IsString()
  @MinLength(1)
  formId: string;

  @IsString()
  @MinLength(1)
  accessToken: string;

  @IsOptional()
  @IsString()
  label?: string;
}

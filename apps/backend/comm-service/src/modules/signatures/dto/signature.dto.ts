import { IsString, IsOptional, IsNotEmpty, IsBoolean } from 'class-validator';

export class CreateSignatureDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  bodyHtml: string;

  @IsOptional()
  @IsString()
  identityId?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateSignatureDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

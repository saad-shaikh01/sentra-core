import { IsString, IsOptional, IsUUID, IsEmail, IsUrl, MinLength, MaxLength } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

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

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  data?: Record<string, unknown>;

  @IsUUID()
  brandId: string;

  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}

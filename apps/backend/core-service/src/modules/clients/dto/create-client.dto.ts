import { IsString, IsEmail, IsOptional, IsUUID, MinLength, MaxLength } from 'class-validator';

export class CreateClientDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsUUID()
  brandId: string;
}

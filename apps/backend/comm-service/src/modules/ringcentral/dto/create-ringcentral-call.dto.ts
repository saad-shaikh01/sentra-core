import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

const ENTITY_TYPES = ['lead', 'client', 'sale', 'project'] as const;

export class CreateRingCentralCallDto {
  @IsString()
  toPhoneNumber: string;

  @IsOptional()
  @IsString()
  fromPhoneNumber?: string;

  @IsOptional()
  @IsString()
  connectionId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsIn(ENTITY_TYPES)
  entityType?: 'lead' | 'client' | 'sale' | 'project';

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsBoolean()
  playPrompt?: boolean;
}

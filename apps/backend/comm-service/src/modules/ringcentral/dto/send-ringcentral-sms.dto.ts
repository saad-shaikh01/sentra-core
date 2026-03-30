import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const ENTITY_TYPES = ['lead', 'client', 'sale', 'project'] as const;

export class SendRingCentralSmsDto {
  @IsString()
  toPhoneNumber: string;

  @IsString()
  @MaxLength(1600)
  text: string;

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
}

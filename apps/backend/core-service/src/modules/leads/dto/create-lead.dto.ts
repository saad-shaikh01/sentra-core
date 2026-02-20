import { IsString, IsOptional, IsUUID, MinLength, MaxLength } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

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

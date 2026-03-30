import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRingCentralCallAnnotationDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  disposition?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

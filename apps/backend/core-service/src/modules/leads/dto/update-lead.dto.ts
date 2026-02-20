import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  data?: Record<string, unknown>;
}

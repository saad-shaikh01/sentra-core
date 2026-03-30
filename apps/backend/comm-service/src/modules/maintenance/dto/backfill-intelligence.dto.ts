import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class BackfillIntelligenceDto {
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(500)
  batchSize?: number;
}

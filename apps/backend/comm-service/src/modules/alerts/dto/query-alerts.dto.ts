import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class QueryAlertsDto {
  @IsOptional()
  @IsIn(['all', 'active', 'unread'])
  status?: 'all' | 'active' | 'unread';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

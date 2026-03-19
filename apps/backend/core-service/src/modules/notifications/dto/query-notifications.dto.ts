import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryNotificationsDto {
  @IsOptional()
  @IsEnum(['true', 'false'])
  isRead?: 'true' | 'false';

  @IsOptional()
  @IsEnum(['SALES', 'PM', 'HRMS', 'COMM', 'SYSTEM'])
  module?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

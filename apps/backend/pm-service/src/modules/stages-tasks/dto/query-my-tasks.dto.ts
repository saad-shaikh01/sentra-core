import { IsOptional, IsEnum, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PmTaskStatus, PmTaskPriority } from '../../../common/enums/pm.enums';

export class QueryMyTasksDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(PmTaskStatus)
  status?: PmTaskStatus;

  @IsOptional()
  @IsEnum(PmTaskPriority)
  priority?: PmTaskPriority;

  /** Only tasks due within the next N hours */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dueSoonHours?: number;

  /** Only blocked tasks */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  blocked?: boolean;
}

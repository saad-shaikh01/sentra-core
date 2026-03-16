import { IsOptional, IsEnum, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { PmTaskStatus, PmTaskPriority, PmDepartmentCode } from '../../../common/enums/pm.enums';

export class QueryTasksDto {
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

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsEnum(PmDepartmentCode)
  departmentCode?: PmDepartmentCode;
}

import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  Min,
  IsDateString,
} from 'class-validator';
import { PmTaskPriority, PmTaskStatus } from '../../../common/enums/pm.enums';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PmTaskStatus)
  status?: PmTaskStatus;

  @IsOptional()
  @IsEnum(PmTaskPriority)
  priority?: PmTaskPriority;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  requiresQc?: boolean;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

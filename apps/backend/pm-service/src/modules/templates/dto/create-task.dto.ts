import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { UserRole } from '@sentra-core/types';

export class CreateTemplateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /**
   * Explicit sort position. If omitted, appended to end of current task list.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  /** Default role to pre-fill when assigning this task in a live project. */
  @IsOptional()
  @IsEnum(UserRole)
  defaultAssigneeRole?: UserRole;

  @IsOptional()
  @IsBoolean()
  requiresQc?: boolean;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  estimatedHours?: number;
}

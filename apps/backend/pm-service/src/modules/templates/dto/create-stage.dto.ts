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
import {
  PmDepartmentCode,
  PmClientReviewMode,
} from '../../../common/enums/pm.enums';

export class CreateStageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEnum(PmDepartmentCode)
  departmentCode: PmDepartmentCode;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /**
   * Explicit sort position. If omitted, appended to end of current stage list.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  /** SLA target in hours for this stage. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760) // 1 year max
  defaultSlaHours?: number;

  @IsOptional()
  @IsEnum(PmClientReviewMode)
  clientReviewMode?: PmClientReviewMode;

  @IsOptional()
  @IsBoolean()
  requiresStageApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresQcByDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isOptional?: boolean;

  @IsOptional()
  @IsBoolean()
  allowsParallel?: boolean;
}

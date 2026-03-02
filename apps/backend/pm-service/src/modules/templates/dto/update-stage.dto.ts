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

export class UpdateStageDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(PmDepartmentCode)
  departmentCode?: PmDepartmentCode;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
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

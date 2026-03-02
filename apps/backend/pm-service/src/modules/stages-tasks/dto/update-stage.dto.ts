import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import {
  PmStageStatus,
  PmClientReviewMode,
  PmDepartmentCode,
} from '../../../common/enums/pm.enums';

export class UpdateStageDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PmStageStatus)
  status?: PmStageStatus;

  @IsOptional()
  @IsEnum(PmDepartmentCode)
  departmentCode?: PmDepartmentCode;

  @IsOptional()
  @IsString()
  ownerLeadId?: string;

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
  @IsDateString()
  dueAt?: string;
}

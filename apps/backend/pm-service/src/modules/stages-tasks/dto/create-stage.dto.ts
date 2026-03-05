import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  PmClientReviewMode,
  PmDepartmentCode,
  PmStageStatus,
} from '../../../common/enums/pm.enums';

export class CreateStageDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(PmDepartmentCode)
  departmentCode!: PmDepartmentCode;

  @IsOptional()
  @IsEnum(PmStageStatus)
  status?: PmStageStatus;

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


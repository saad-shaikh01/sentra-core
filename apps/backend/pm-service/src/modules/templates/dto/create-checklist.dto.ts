import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
  IsUUID,
  Min,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PmChecklistType } from '../../../common/enums/pm.enums';

export class CreateChecklistItemDto {
  @IsEnum(PmChecklistType)
  checklistType: PmChecklistType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  label: string;

  /**
   * Stage-scoped checklist — must provide either stageId or taskId, not both.
   */
  @ValidateIf((o) => !o.templateTaskId)
  @IsUUID('4')
  templateStageId?: string;

  /**
   * Task-scoped checklist.
   */
  @ValidateIf((o) => !o.templateStageId)
  @IsUUID('4')
  templateTaskId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { PmChecklistType } from '../../../common/enums/pm.enums';

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsEnum(PmChecklistType)
  checklistType?: PmChecklistType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

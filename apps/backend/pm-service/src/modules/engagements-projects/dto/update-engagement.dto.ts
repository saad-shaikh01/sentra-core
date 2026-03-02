import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PmEngagementStatus, PmProjectPriority } from '../../../common/enums/pm.enums';

export class UpdateEngagementDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(PmProjectPriority)
  priority?: PmProjectPriority;

  @IsOptional()
  @IsEnum(PmEngagementStatus)
  status?: PmEngagementStatus;

  @IsOptional()
  @IsUUID('4')
  primaryBrandId?: string;
}

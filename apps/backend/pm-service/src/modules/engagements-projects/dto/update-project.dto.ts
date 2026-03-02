import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  MaxLength,
  IsDateString,
} from 'class-validator';
import {
  PmProjectStatus,
  PmProjectPriority,
  PmHealthStatus,
} from '../../../common/enums/pm.enums';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(PmProjectStatus)
  status?: PmProjectStatus;

  @IsOptional()
  @IsEnum(PmProjectPriority)
  priority?: PmProjectPriority;

  @IsOptional()
  @IsEnum(PmHealthStatus)
  healthStatus?: PmHealthStatus;

  @IsOptional()
  @IsDateString()
  deliveryDueAt?: string;

  @IsOptional()
  @IsUUID('4')
  clientId?: string;
}

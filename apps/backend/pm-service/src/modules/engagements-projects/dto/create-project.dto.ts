import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsUUID,
  MaxLength,
  IsDateString,
} from 'class-validator';
import {
  PmProjectType,
  PmServiceType,
  PmProjectPriority,
} from '../../../common/enums/pm.enums';

export class CreateProjectDto {
  @IsUUID('4')
  engagementId: string;

  @IsUUID('4')
  brandId: string;

  @IsOptional()
  @IsUUID('4')
  clientId?: string;

  /** When provided, triggers template-to-project stage/task generation (PM-BE-009). */
  @IsOptional()
  @IsUUID('4')
  templateId?: string;

  @IsEnum(PmProjectType)
  projectType: PmProjectType;

  @IsEnum(PmServiceType)
  serviceType: PmServiceType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(PmProjectPriority)
  priority?: PmProjectPriority;

  @IsOptional()
  @IsDateString()
  deliveryDueAt?: string;
}

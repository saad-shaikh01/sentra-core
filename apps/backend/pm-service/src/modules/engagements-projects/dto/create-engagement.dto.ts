import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PmProjectOwnerType, PmProjectPriority } from '../../../common/enums/pm.enums';

export class CreateEngagementDto {
  @IsEnum(PmProjectOwnerType)
  ownerType: PmProjectOwnerType;

  /** Required when ownerType is CLIENT. */
  @IsOptional()
  @IsUUID('4')
  clientId?: string;

  /** Required when ownerType is INTERNAL_BRAND. */
  @IsOptional()
  @IsUUID('4')
  ownerBrandId?: string;

  @IsOptional()
  @IsUUID('4')
  primaryBrandId?: string;

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
}

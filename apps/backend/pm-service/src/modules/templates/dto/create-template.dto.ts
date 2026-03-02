import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PmServiceType } from '../../../common/enums/pm.enums';

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEnum(PmServiceType)
  serviceType: PmServiceType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Scope template to one brand. Omit for org-wide templates. */
  @IsOptional()
  @IsUUID('4')
  brandId?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

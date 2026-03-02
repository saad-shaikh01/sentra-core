import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { PmFileScopeType, PmFileLinkType } from '../../../common/enums/pm.enums';

export class LinkFileDto {
  @IsEnum(PmFileScopeType)
  scopeType!: PmFileScopeType;

  @IsString()
  @IsNotEmpty()
  scopeId!: string;

  @IsOptional()
  @IsEnum(PmFileLinkType)
  linkType?: PmFileLinkType = PmFileLinkType.REFERENCE;

  /** Specific version to link; if omitted, links to the latest version */
  @IsOptional()
  @IsString()
  fileVersionId?: string;
}

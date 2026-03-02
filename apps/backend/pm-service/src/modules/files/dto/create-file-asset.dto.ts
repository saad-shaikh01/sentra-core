import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { PmFileAssetType } from '../../../common/enums/pm.enums';

export class CreateFileAssetDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsEnum(PmFileAssetType)
  assetType!: PmFileAssetType;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  mimeType?: string;
}

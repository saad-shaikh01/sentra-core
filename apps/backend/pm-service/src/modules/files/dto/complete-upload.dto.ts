import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CompleteUploadDto {
  /** The fileAssetId returned from the upload-token step */
  @IsString()
  @IsNotEmpty()
  fileAssetId!: string;

  /** The storage key where the file was uploaded (e.g. S3 object key) */
  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @IsString()
  @IsNotEmpty()
  originalFilename!: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsString()
  checksum?: string;
}

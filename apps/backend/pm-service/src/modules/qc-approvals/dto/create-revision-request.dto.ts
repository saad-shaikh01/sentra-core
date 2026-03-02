import { IsString, IsOptional, IsEnum } from 'class-validator';
import { PmRevisionSourceType } from '../../../common/enums/pm.enums';

export class CreateRevisionRequestDto {
  @IsEnum(PmRevisionSourceType)
  sourceType!: PmRevisionSourceType;

  @IsOptional()
  @IsString()
  sourceUserId?: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  requestType?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

import { IsOptional, IsEnum, IsUUID, IsString, MaxLength } from 'class-validator';
import { PmPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  PmProjectStatus,
  PmProjectType,
  PmServiceType,
  PmProjectPriority,
  PmHealthStatus,
} from '../../../common/enums/pm.enums';

export class QueryProjectsDto extends PmPaginationQueryDto {
  /** Preferred name search param. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  /**
   * Backward-compatible alias for `name`.
   * When both are present, `name` takes precedence.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsUUID('4')
  engagementId?: string;

  @IsOptional()
  @IsEnum(PmProjectStatus)
  status?: PmProjectStatus;

  @IsOptional()
  @IsUUID('4')
  brandId?: string;

  @IsOptional()
  @IsUUID('4')
  clientId?: string;

  @IsOptional()
  @IsEnum(PmProjectType)
  projectType?: PmProjectType;

  @IsOptional()
  @IsEnum(PmServiceType)
  serviceType?: PmServiceType;

  @IsOptional()
  @IsEnum(PmHealthStatus)
  healthStatus?: PmHealthStatus;

  @IsOptional()
  @IsEnum(PmProjectPriority)
  priority?: PmProjectPriority;
}

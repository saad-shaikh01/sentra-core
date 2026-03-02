import { IsOptional, IsEnum, IsUUID } from 'class-validator';
import { PmPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  PmProjectStatus,
  PmProjectType,
  PmServiceType,
  PmProjectPriority,
  PmHealthStatus,
} from '../../../common/enums/pm.enums';

export class QueryProjectsDto extends PmPaginationQueryDto {
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

import { IsOptional, IsEnum, IsUUID } from 'class-validator';
import { PmPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import {
  PmEngagementStatus,
  PmProjectOwnerType,
  PmProjectPriority,
} from '../../../common/enums/pm.enums';

export class QueryEngagementsDto extends PmPaginationQueryDto {
  @IsOptional()
  @IsEnum(PmEngagementStatus)
  status?: PmEngagementStatus;

  @IsOptional()
  @IsEnum(PmProjectOwnerType)
  ownerType?: PmProjectOwnerType;

  @IsOptional()
  @IsUUID('4')
  clientId?: string;

  @IsOptional()
  @IsUUID('4')
  ownerBrandId?: string;

  @IsOptional()
  @IsEnum(PmProjectPriority)
  priority?: PmProjectPriority;
}

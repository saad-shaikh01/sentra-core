import { IsOptional, IsEnum } from 'class-validator';
import { PmPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PmDepartmentCode, PmStageStatus } from '../../../common/enums/pm.enums';

/**
 * Query DTO for the stage queue (GET /api/pm/stages).
 * Supports status and departmentCode filters for the frontend stage queue view.
 */
export class QueryStagesDto extends PmPaginationQueryDto {
  @IsOptional()
  @IsEnum(PmStageStatus)
  status?: PmStageStatus;

  @IsOptional()
  @IsEnum(PmDepartmentCode)
  departmentCode?: PmDepartmentCode;
}

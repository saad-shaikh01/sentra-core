import { IsOptional, IsEnum, IsUUID, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { PmPaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { PmServiceType } from '../../../common/enums/pm.enums';

export class QueryTemplatesDto extends PmPaginationQueryDto {
  @IsOptional()
  @IsEnum(PmServiceType)
  serviceType?: PmServiceType;

  @IsOptional()
  @IsUUID('4')
  brandId?: string;

  /**
   * Filter by active status.
   * Defaults to active-only when not provided.
   * Pass `isActive=false` to list archived templates.
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isActive?: boolean;
}

import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Base pagination DTO used by all comm list endpoints.
 * All comm list endpoints are paginated — no unbounded list queries allowed.
 *
 * Extend this in feature-specific list DTOs to add filter/sort fields.
 *
 * Route convention: ?page=1&limit=20
 */
export class CommPaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

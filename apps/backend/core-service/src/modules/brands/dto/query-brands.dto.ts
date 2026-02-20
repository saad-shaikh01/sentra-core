import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common';

export class QueryBrandsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

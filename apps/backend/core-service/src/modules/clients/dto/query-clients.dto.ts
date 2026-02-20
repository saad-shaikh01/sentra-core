import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common';

export class QueryClientsDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

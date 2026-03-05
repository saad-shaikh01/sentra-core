import { IsOptional, IsString } from 'class-validator';
import { CommPaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListThreadsQueryDto extends CommPaginationQueryDto {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ListMessagesQueryDto extends CommPaginationQueryDto {}

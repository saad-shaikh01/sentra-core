import { IsOptional, IsString, IsIn } from 'class-validator';
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

  @IsOptional()
  @IsIn(['all', 'unread', 'sent', 'archived'])
  filter?: 'all' | 'unread' | 'sent' | 'archived';

  @IsOptional()
  @IsString()
  identityId?: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class ListMessagesQueryDto extends CommPaginationQueryDto {}

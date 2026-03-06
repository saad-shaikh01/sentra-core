import { IsOptional, IsString } from 'class-validator';
import { CommPaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class ListMessagesQueryDto extends CommPaginationQueryDto {
  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;
}

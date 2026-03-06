import { IsString, IsIn } from 'class-validator';
import { CommPaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateEntityLinkDto {
  @IsString()
  gmailThreadId: string;

  @IsString()
  entityType: string;

  @IsString()
  entityId: string;
}

export class DeleteEntityLinkByEntityDto {
  @IsString()
  threadId: string;

  @IsString()
  entityType: string;

  @IsString()
  entityId: string;
}

export class ListEntityLinksQueryDto extends CommPaginationQueryDto {
  @IsString()
  entityType: string;

  @IsString()
  entityId: string;
}

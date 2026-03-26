import { IsArray, IsOptional, IsString } from 'class-validator';
import { CommPaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CreateEntityLinkDto {
  @IsOptional()
  @IsString()
  threadId?: string;

  @IsOptional()
  @IsString()
  gmailThreadId?: string;

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

export class BackfillByEmailDto {
  @IsString()
  organizationId: string;

  @IsString()
  entityType: string;

  @IsString()
  entityId: string;

  @IsArray()
  @IsString({ each: true })
  emails: string[];
}

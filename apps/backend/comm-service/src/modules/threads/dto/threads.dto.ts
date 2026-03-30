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
  @IsIn([
    'all',
    'unread',
    'sent',
    'archived',
    'fresh',
    'waiting',
    'ghosted',
    'replied',
    'bounced',
    'failed',
    'opened',
    'unopened',
    'suspicious',
    'needs_follow_up',
    'hot_lead',
    'overdue',
    'opened_no_reply',
    'suspicious_only',
  ])
  filter?:
    | 'all'
    | 'unread'
    | 'sent'
    | 'archived'
    | 'fresh'
    | 'waiting'
    | 'ghosted'
    | 'replied'
    | 'bounced'
    | 'failed'
    | 'opened'
    | 'unopened'
    | 'suspicious'
    | 'needs_follow_up'
    | 'hot_lead'
    | 'overdue'
    | 'opened_no_reply'
    | 'suspicious_only';

  @IsOptional()
  @IsString()
  identityId?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsIn(['all'])
  scope?: 'all';
}

export class ListMessagesQueryDto extends CommPaginationQueryDto {}

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface CommAttachment {
  filename: string;
  mimeType: string;
  size: number;
  gmailAttachmentId?: string;
}

export interface EntityLink {
  entityType: 'lead' | 'client' | 'project';
  entityId: string;
}

export interface SendAsAlias {
  email: string;
  name?: string;
  isDefault: boolean;
}

export interface CommIdentity {
  id: string;
  userId?: string;
  brandId?: string;
  email: string;
  displayName: string;
  isDefault: boolean;
  sendAsAliases: SendAsAlias[];
  syncState: {
    status: 'active' | 'error' | 'paused';
    lastSyncAt: string | null;
    lastError: string | null;
    initialSyncDone?: boolean;
  };
}

export interface CommThread {
  id: string;
  subject?: string;
  snippet?: string;
  participants: EmailAddress[];
  latestMessageAt?: string;
  lastMessageAt?: string;
  messageCount: number;
  hasAttachments?: boolean;
  hasUnread?: boolean;
  isRead?: boolean;
  isArchived?: boolean;
  labelIds?: string[];
  entityLinks: EntityLink[];
  identityId?: string;
  gmailThreadId?: string;
}

export interface CommMessage {
  id: string;
  threadId?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  direction?: 'inbound' | 'outbound';
  isSentByIdentity?: boolean;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  attachments: CommAttachment[];
  sentAt?: string;
  labelIds?: string[];
  identityId?: string;
  sentByUserId?: string;
}

export interface CommMessageSummary {
  id: string;
  threadId?: string;
  gmailThreadId?: string;
  direction?: 'inbound' | 'outbound';
  isSentByIdentity?: boolean;
  from: EmailAddress;
  subject?: string;
  snippet?: string;
  sentAt?: string;
  hasAttachments?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CommIdentityListResponse {
  data: CommIdentity[];
}

export interface ListThreadsParams {
  page?: number;
  limit?: number;
  search?: string;
  filter?: 'all' | 'unread' | 'sent' | 'archived';
  identityId?: string;
  scope?: 'all';
}

export interface ListMessagesParams {
  threadId?: string;
  page?: number;
  limit?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface SendMessageDto {
  identityId: string;
  fromAlias?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachmentS3Keys?: string[];
  entityType?: string;
  entityId?: string;
}

export interface ReplyDto {
  identityId: string;
  fromAlias?: string;
  bodyText?: string;
  bodyHtml?: string;
  cc?: string[];
  attachmentS3Keys?: string[];
  replyAll?: boolean;
}

export interface ForwardDto {
  identityId: string;
  to: string[];
  bodyText?: string;
  bodyHtml?: string;
  attachmentS3Keys?: string[];
}

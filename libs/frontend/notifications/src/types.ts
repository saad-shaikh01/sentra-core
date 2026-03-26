// ============================================================
// GlobalNotification types — mirrors the Prisma GlobalNotification model
// ============================================================

export type GlobalNotificationType =
  | 'SALE_CREATED'
  | 'SALE_STATUS_CHANGED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_FAILED'
  | 'INVOICE_OVERDUE'
  | 'CHARGEBACK_FILED'
  | 'LEAD_CREATED'
  | 'LEAD_ASSIGNED'
  | 'LEAD_CONTRIBUTOR_ADDED'
  | 'CLIENT_ASSIGNED'
  | 'CLIENT_PM_ASSIGNED'
  | 'TASK_ASSIGNED'
  | 'TASK_DUE_SOON'
  | 'COMMENT_ADDED'
  | 'PROJECT_STATUS_CHANGED'
  | 'APPROVAL_REQUESTED'
  | 'MENTION'
  | 'SYSTEM_ALERT';

export type AppModule = 'SALES' | 'PM' | 'HRMS' | 'COMM' | 'SYSTEM';

export interface GlobalNotification {
  id: string;
  organizationId: string;
  recipientId: string;
  actorId: string | null;
  type: GlobalNotificationType;
  module: AppModule;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  url: string | null;
  isMention: boolean;
  mentionContext: string | null;
  isRead: boolean;
  readAt: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListParams {
  page?: number;
  limit?: number;
  isRead?: 'true' | 'false';
  module?: AppModule;
}

export interface NotificationListResponse {
  data: GlobalNotification[];
  total: number;
  unreadCount: number;
  page: number;
  limit: number;
}

export interface MarkReadResponse {
  id: string;
  isRead: boolean;
  readAt: string | null;
}

export interface MarkAllReadResponse {
  success: boolean;
}

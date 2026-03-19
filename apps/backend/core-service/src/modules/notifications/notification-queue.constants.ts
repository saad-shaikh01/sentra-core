export const NOTIFICATION_QUEUE = 'global-notification';

export const NotificationJobName = {
  DISPATCH: 'dispatch',
} as const;

export interface NotificationJobPayload {
  organizationId: string;
  recipientIds: string[];
  actorId?: string;
  type: string;           // GlobalNotificationType value
  module: string;         // AppModule value
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  url?: string;
  isMention?: boolean;
  mentionContext?: string;
  data?: Record<string, unknown>;
}

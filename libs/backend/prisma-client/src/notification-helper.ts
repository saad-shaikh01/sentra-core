import { Queue } from 'bullmq';
import { parseMentions } from './mention-parser';

// These must match EXACTLY what NOTIF-002 defines in core-service
export const NOTIFICATION_QUEUE = 'global-notification';
export const NOTIFICATION_JOB_DISPATCH = 'dispatch';

export interface NotifyInput {
  organizationId: string;
  recipientIds: string[];
  actorId?: string;
  type: string;           // use GlobalNotificationType enum values as strings
  module: string;         // use AppModule enum values as strings
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  url?: string;
  isMention?: boolean;
  mentionContext?: string;
  data?: Record<string, unknown>;
}

export interface NotifyMentionsInput {
  content: string | object;   // Tiptap JSON or plain text
  context: string;            // human-readable context e.g. "in Sale #123"
  url: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorName: string;
  organizationId: string;
  module: string;             // AppModule value
}

export class NotificationHelper {
  constructor(private readonly queue: Queue) {}

  /**
   * Enqueue a notification to be delivered asynchronously.
   * Returns immediately — does NOT block the API response.
   */
  async notify(input: NotifyInput): Promise<void> {
    if (!input.recipientIds || input.recipientIds.length === 0) return;

    await this.queue.add(NOTIFICATION_JOB_DISPATCH, input, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    });
  }

  /**
   * Parse @mentions from rich text content and enqueue MENTION notifications
   * for each mentioned user. Call this when saving any text content that
   * supports @mentions (task description, comments, sale notes, etc.).
   *
   * Safe to call always — does nothing if no mentions found.
   */
  async notifyMentions(input: NotifyMentionsInput): Promise<void> {
    const mentions = parseMentions(input.content);
    if (mentions.length === 0) return;

    // Filter out self-mentions — actor should not receive their own mention notification
    const recipients = mentions
      .map((m) => m.userId)
      .filter((id) => id !== input.actorId);

    if (recipients.length === 0) return;

    await this.notify({
      organizationId: input.organizationId,
      recipientIds: recipients,
      actorId: input.actorId,
      type: 'MENTION',
      module: input.module,
      title: `${input.actorName} mentioned you`,
      body: `${input.actorName} mentioned you ${input.context}`,
      entityType: input.entityType,
      entityId: input.entityId,
      url: input.url,
      isMention: true,
      mentionContext: input.context,
    });
  }
}

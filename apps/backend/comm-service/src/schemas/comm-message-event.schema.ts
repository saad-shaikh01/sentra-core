import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  CommMessageOpenSource,
} from './comm-message.schema';

export type CommMessageEventDocument = HydratedDocument<CommMessageEvent>;
export type CommMessageEventType =
  | 'sent'
  | 'open_pixel'
  | 'reply_detected'
  | 'bounce_detected'
  | 'send_failed';

export class CommMessageEventRequestMeta {
  ipHash?: string;
  userAgent?: string;
  userAgentHash?: string;
  referer?: string;
  source?: CommMessageOpenSource;
  suspicionReasons?: string[];
  isSuspicious?: boolean;
  isHumanEstimated?: boolean;
}

@Schema({ collection: 'comm_message_events', timestamps: true })
export class CommMessageEvent {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop()
  messageId?: string;

  @Prop()
  threadId?: string;

  @Prop()
  gmailMessageId?: string;

  @Prop()
  gmailThreadId?: string;

  @Prop()
  identityId?: string;

  @Prop()
  entityType?: string;

  @Prop()
  entityId?: string;

  @Prop()
  recipientEmail?: string;

  @Prop({ required: true, enum: ['sent', 'open_pixel', 'reply_detected', 'bounce_detected', 'send_failed'] })
  eventType: CommMessageEventType;

  @Prop({ required: true, default: () => new Date() })
  occurredAt: Date;

  @Prop()
  tokenId?: string;

  @Prop({ type: Object })
  requestMeta?: CommMessageEventRequestMeta;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const CommMessageEventSchema = SchemaFactory.createForClass(CommMessageEvent);

CommMessageEventSchema.index({ organizationId: 1, eventType: 1, occurredAt: -1 });
CommMessageEventSchema.index({ organizationId: 1, messageId: 1, occurredAt: -1 });
CommMessageEventSchema.index({ organizationId: 1, threadId: 1, occurredAt: -1 });
CommMessageEventSchema.index({ organizationId: 1, tokenId: 1, occurredAt: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommMessageDocument = HydratedDocument<CommMessage>;
export type CommMessageDeliveryState = 'none' | 'sent' | 'send_failed' | 'bounce_detected';
export type CommMessageTrackingMode = 'none' | 'per_message';
export type CommMessageOpenTrackingState =
  | 'disabled'
  | 'enabled'
  | 'open_signal_detected'
  | 'suspicious_signal_detected';
export type CommMessageOpenSource =
  | 'direct'
  | 'google_image_proxy'
  | 'security_scanner'
  | 'unknown';

export class EmailAddress {
  email: string;
  name?: string;
}

export class MessageAttachmentRef {
  filename: string;
  mimeType: string;
  size: number;
  gmailAttachmentId?: string;
  s3Key?: string;
  archivedAt?: Date;
}

@Schema({ collection: 'comm_messages', timestamps: true })
export class CommMessage {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  gmailThreadId: string;

  @Prop({ required: true })
  gmailMessageId: string;

  @Prop({ required: true })
  identityId: string;

  @Prop({ type: Object, required: true })
  from: EmailAddress;

  @Prop({ type: [Object], default: [] })
  to: EmailAddress[];

  @Prop({ type: [Object], default: [] })
  cc: EmailAddress[];

  @Prop({ type: [Object], default: [] })
  bcc: EmailAddress[];

  @Prop()
  subject?: string;

  @Prop()
  bodyText?: string;

  @Prop()
  bodyHtml?: string;

  @Prop({ type: [Object], default: [] })
  attachments: MessageAttachmentRef[];

  @Prop()
  sentAt?: Date;

  @Prop()
  gmailInternalDate?: Date;

  @Prop()
  rfcMessageId?: string;

  @Prop()
  inReplyToRfcMessageId?: string;

  @Prop({ type: [String], default: [] })
  referenceIds: string[];

  @Prop({ type: Object })
  headers?: Record<string, string>;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ default: false })
  isSentByIdentity: boolean;

  @Prop({ default: false })
  isBounceDetected: boolean;

  @Prop({ enum: ['none', 'sent', 'send_failed', 'bounce_detected'], default: 'none' })
  deliveryState: CommMessageDeliveryState;

  @Prop()
  bounceDetectedAt?: Date;

  @Prop()
  bounceReason?: string;

  @Prop({ default: false })
  trackingEnabled: boolean;

  @Prop({ enum: ['none', 'per_message'], default: 'none' })
  trackingMode: CommMessageTrackingMode;

  @Prop()
  trackingTokenId?: string;

  @Prop()
  trackedRecipientEmail?: string;

  @Prop()
  firstOpenedAt?: Date;

  @Prop()
  lastOpenedAt?: Date;

  @Prop({ default: 0 })
  openCount: number;

  @Prop({ default: 0 })
  estimatedHumanOpenCount: number;

  @Prop({ default: 0 })
  suspiciousOpenCount: number;

  @Prop({ enum: ['direct', 'google_image_proxy', 'security_scanner', 'unknown'] })
  lastOpenSource?: CommMessageOpenSource;

  @Prop({
    enum: ['disabled', 'enabled', 'open_signal_detected', 'suspicious_signal_detected'],
    default: 'disabled',
  })
  openTrackingState: CommMessageOpenTrackingState;

  @Prop()
  sentByUserId?: string;

  @Prop({ type: [String], default: [] })
  gmailLabels: string[];
}

export const CommMessageSchema = SchemaFactory.createForClass(CommMessage);

CommMessageSchema.index({ organizationId: 1, gmailMessageId: 1 }, { unique: true });
CommMessageSchema.index({ organizationId: 1, gmailThreadId: 1, sentAt: 1 });
CommMessageSchema.index({ organizationId: 1, rfcMessageId: 1 }, { sparse: true });
CommMessageSchema.index({ organizationId: 1, trackingTokenId: 1 }, { sparse: true });
CommMessageSchema.index({ organizationId: 1, trackingEnabled: 1, lastOpenedAt: -1 });

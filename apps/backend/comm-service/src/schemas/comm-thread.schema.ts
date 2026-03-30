import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommThreadDocument = HydratedDocument<CommThread>;
export type CommThreadReplyState = 'none' | 'fresh' | 'waiting' | 'ghosted' | 'replied';
export type CommThreadDeliveryState = 'none' | 'sent' | 'send_failed' | 'bounce_detected';
export type CommThreadBounceState = 'none' | 'detected';
export type CommThreadResponseTimeSignalQuality = 'insufficient' | 'weak' | 'usable';
export type CommThreadResponseTimeScope = 'none' | 'recipient_email' | 'entity' | 'organization';
export type CommThreadSilenceState = 'none' | 'watch' | 'overdue' | 'at_risk' | 'ghosted';
export type CommThreadEngagementBand = 'low' | 'medium' | 'high';
export type CommThreadEngagementConfidence = 'low' | 'medium' | 'high';
export type CommThreadOpenSource =
  | 'direct'
  | 'google_image_proxy'
  | 'security_scanner'
  | 'unknown';

export class ThreadParticipant {
  email: string;
  name?: string;
}

export class ThreadEntityLink {
  entityType: string;
  entityId: string;
  linkedBy: 'AUTO' | 'MANUAL';
  linkedAt: Date;
}

@Schema({ collection: 'comm_threads', timestamps: true })
export class CommThread {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  identityId: string;

  @Prop({ required: true })
  gmailThreadId: string;

  @Prop()
  subject?: string;

  @Prop({ type: [Object], default: [] })
  participants: ThreadParticipant[];

  @Prop({ type: [Object], default: [] })
  entityLinks: ThreadEntityLink[];

  @Prop({ default: 0 })
  messageCount: number;

  @Prop()
  lastMessageAt?: Date;

  @Prop()
  lastOutboundAt?: Date;

  @Prop()
  lastInboundAt?: Date;

  @Prop()
  repliedAt?: Date;

  @Prop({ default: false })
  hasUnread: boolean;

  @Prop({ default: false })
  hasSent: boolean;

  @Prop({ enum: ['none', 'fresh', 'waiting', 'ghosted', 'replied'], default: 'none' })
  replyState: CommThreadReplyState;

  @Prop({ enum: ['none', 'sent', 'send_failed', 'bounce_detected'], default: 'none' })
  deliveryState: CommThreadDeliveryState;

  @Prop({ enum: ['none', 'detected'], default: 'none' })
  bounceState: CommThreadBounceState;

  @Prop()
  bounceDetectedAt?: Date;

  @Prop()
  bounceReason?: string;

  @Prop()
  lastSendFailureAt?: Date;

  @Prop()
  lastSendFailureReason?: string;

  @Prop({ default: false })
  trackingEnabled: boolean;

  @Prop()
  firstOpenedAt?: Date;

  @Prop()
  lastOpenedAt?: Date;

  @Prop({ default: 0 })
  trackedOpenCount: number;

  @Prop({ default: 0 })
  estimatedHumanOpenCount: number;

  @Prop({ default: 0 })
  suspiciousOpenCount: number;

  @Prop({ default: false })
  hasOpenSignal: boolean;

  @Prop({ enum: ['direct', 'google_image_proxy', 'security_scanner', 'unknown'] })
  lastOpenSource?: CommThreadOpenSource;

  @Prop()
  primaryRecipientEmail?: string;

  @Prop({ default: 0 })
  recentEstimatedHumanOpenCount: number;

  @Prop({ default: 0 })
  recentSuspiciousOpenCount: number;

  @Prop()
  firstReplyTimeMs?: number;

  @Prop({ default: 0 })
  responseTimeComparableCount: number;

  @Prop()
  responseTimeMedianMs?: number;

  @Prop()
  responseTimeP75Ms?: number;

  @Prop()
  responseTimeAverageMs?: number;

  @Prop({ enum: ['insufficient', 'weak', 'usable'], default: 'insufficient' })
  responseTimeSignalQuality: CommThreadResponseTimeSignalQuality;

  @Prop({ enum: ['none', 'recipient_email', 'entity', 'organization'], default: 'none' })
  responseTimeScope: CommThreadResponseTimeScope;

  @Prop()
  expectedReplyWindowMs?: number;

  @Prop({ enum: ['none', 'watch', 'overdue', 'at_risk', 'ghosted'], default: 'none' })
  silenceState: CommThreadSilenceState;

  @Prop()
  silenceOverdueFactor?: number;

  @Prop({ default: 0 })
  engagementScore: number;

  @Prop({ enum: ['low', 'medium', 'high'], default: 'low' })
  engagementBand: CommThreadEngagementBand;

  @Prop({ enum: ['low', 'medium', 'high'], default: 'low' })
  engagementScoreConfidence: CommThreadEngagementConfidence;

  @Prop({ type: [String], default: [] })
  scoreReasons: string[];

  @Prop({ default: false })
  needsFollowUpNow: boolean;

  @Prop({ default: false })
  hotLead: boolean;

  @Prop({ default: false })
  openedButNotReplied: boolean;

  @Prop({ default: false })
  suspiciousTrackingOnly: boolean;

  @Prop()
  lastIntelligenceRefreshAt?: Date;

  @Prop({ default: false })
  isArchived: boolean;

  @Prop()
  snippet?: string;
}

export const CommThreadSchema = SchemaFactory.createForClass(CommThread);

CommThreadSchema.index({ organizationId: 1, gmailThreadId: 1 }, { unique: true });
CommThreadSchema.index({ organizationId: 1, lastMessageAt: -1 });
CommThreadSchema.index({ organizationId: 1, isArchived: 1, lastMessageAt: -1 });
CommThreadSchema.index({ organizationId: 1, identityId: 1, lastMessageAt: -1 });
CommThreadSchema.index({ organizationId: 1, hasUnread: 1, lastMessageAt: -1 });
CommThreadSchema.index({ organizationId: 1, hasSent: 1, lastMessageAt: -1 });
CommThreadSchema.index({ organizationId: 1, replyState: 1, lastMessageAt: -1 });
CommThreadSchema.index({ organizationId: 1, deliveryState: 1, lastMessageAt: -1 });
CommThreadSchema.index({ organizationId: 1, hasOpenSignal: 1, lastMessageAt: -1 });
CommThreadSchema.index({ organizationId: 1, suspiciousOpenCount: 1, lastMessageAt: -1 });
CommThreadSchema.index({ organizationId: 1, primaryRecipientEmail: 1, repliedAt: -1 });
CommThreadSchema.index({ organizationId: 1, responseTimeSignalQuality: 1, repliedAt: -1 });
CommThreadSchema.index({ organizationId: 1, hotLead: 1, engagementScore: -1, lastMessageAt: -1 });
CommThreadSchema.index({ organizationId: 1, needsFollowUpNow: 1, lastOutboundAt: -1 });
CommThreadSchema.index({ organizationId: 1, silenceState: 1, silenceOverdueFactor: -1, lastOutboundAt: -1 });
CommThreadSchema.index({ organizationId: 1, openedButNotReplied: 1, lastOpenedAt: -1 });
CommThreadSchema.index({ organizationId: 1, suspiciousTrackingOnly: 1, lastOpenedAt: -1 });
CommThreadSchema.index({ organizationId: 1, 'entityLinks.entityType': 1, 'entityLinks.entityId': 1 });

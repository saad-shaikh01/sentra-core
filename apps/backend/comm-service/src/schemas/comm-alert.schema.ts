import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommAlertDocument = HydratedDocument<CommAlert>;
export type CommAlertType = 'multi_open' | 'hot_lead' | 'overdue_follow_up';
export type CommAlertSeverity = 'info' | 'warning' | 'success';

@Schema({ collection: 'comm_alerts', timestamps: true })
export class CommAlert {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  recipientUserId: string;

  @Prop({ required: true })
  dedupeKey: string;

  @Prop({ enum: ['multi_open', 'hot_lead', 'overdue_follow_up'], required: true })
  alertType: CommAlertType;

  @Prop({ enum: ['info', 'warning', 'success'], required: true })
  severity: CommAlertSeverity;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop()
  threadId?: string;

  @Prop()
  gmailThreadId?: string;

  @Prop()
  identityId?: string;

  @Prop()
  entityType?: string;

  @Prop()
  entityId?: string;

  @Prop()
  firstTriggeredAt?: Date;

  @Prop()
  lastTriggeredAt?: Date;

  @Prop({ type: [String], default: [] })
  reasonKeys: string[];

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const CommAlertSchema = SchemaFactory.createForClass(CommAlert);

CommAlertSchema.index({ organizationId: 1, recipientUserId: 1, isActive: 1, lastTriggeredAt: -1 });
CommAlertSchema.index({ organizationId: 1, recipientUserId: 1, isRead: 1, lastTriggeredAt: -1 });
CommAlertSchema.index({ organizationId: 1, recipientUserId: 1, dedupeKey: 1 }, { unique: true });

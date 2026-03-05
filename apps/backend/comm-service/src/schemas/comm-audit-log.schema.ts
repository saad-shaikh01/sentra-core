import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommAuditLogDocument = HydratedDocument<CommAuditLog>;

export type CommAuditAction =
  | 'MESSAGE_SENT'
  | 'MESSAGE_REPLIED'
  | 'MESSAGE_FORWARDED'
  | 'IDENTITY_CONNECTED'
  | 'IDENTITY_DISCONNECTED'
  | 'IDENTITY_TOKEN_REFRESHED'
  | 'THREAD_LINKED'
  | 'THREAD_UNLINKED'
  | 'THREAD_ARCHIVED'
  | 'THREAD_READ'
  | 'SYNC_STARTED'
  | 'SYNC_COMPLETED'
  | 'SYNC_FAILED';

@Schema({ collection: 'comm_audit_logs', timestamps: true })
export class CommAuditLog {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  actorUserId: string;

  @Prop({ required: true, index: true })
  action: CommAuditAction;

  @Prop({ required: true })
  entityType: string;

  @Prop({ required: true })
  entityId: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;
}

export const CommAuditLogSchema = SchemaFactory.createForClass(CommAuditLog);
CommAuditLogSchema.index({ organizationId: 1, action: 1, createdAt: -1 });
CommAuditLogSchema.index({ organizationId: 1, entityType: 1, entityId: 1, createdAt: -1 });
CommAuditLogSchema.index({ organizationId: 1, actorUserId: 1, createdAt: -1 });

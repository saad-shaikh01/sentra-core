import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommThreadDocument = HydratedDocument<CommThread>;

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

  @Prop({ default: false })
  hasUnread: boolean;

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
CommThreadSchema.index({ organizationId: 1, 'entityLinks.entityType': 1, 'entityLinks.entityId': 1 });

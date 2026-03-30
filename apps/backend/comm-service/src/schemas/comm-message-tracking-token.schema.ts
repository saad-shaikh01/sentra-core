import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommMessageTrackingTokenDocument = HydratedDocument<CommMessageTrackingToken>;
export type CommMessageTrackingTokenStatus = 'reserved' | 'active' | 'abandoned';

@Schema({ collection: 'comm_message_tracking_tokens', timestamps: true })
export class CommMessageTrackingToken {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  identityId: string;

  @Prop()
  messageId?: string;

  @Prop()
  threadId?: string;

  @Prop()
  gmailMessageId?: string;

  @Prop()
  gmailThreadId?: string;

  @Prop()
  entityType?: string;

  @Prop()
  entityId?: string;

  @Prop()
  recipientEmail?: string;

  @Prop({ default: 0 })
  recipientCount: number;

  @Prop({ required: true })
  tokenHash: string;

  @Prop({ default: 'open' })
  tokenType: 'open';

  @Prop({ default: 'per_message' })
  trackingMode: 'per_message';

  @Prop({ enum: ['reserved', 'active', 'abandoned'], default: 'reserved' })
  status: CommMessageTrackingTokenStatus;
}

export const CommMessageTrackingTokenSchema = SchemaFactory.createForClass(CommMessageTrackingToken);

CommMessageTrackingTokenSchema.index({ tokenHash: 1 }, { unique: true });
CommMessageTrackingTokenSchema.index({ organizationId: 1, gmailMessageId: 1 }, { sparse: true });
CommMessageTrackingTokenSchema.index({ organizationId: 1, messageId: 1 }, { sparse: true });

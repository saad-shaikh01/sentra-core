import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RingCentralSmsDirection } from './ringcentral-sms-thread.schema';

export type RingCentralSmsMessageDocument = HydratedDocument<RingCentralSmsMessage>;

@Schema({ collection: 'ringcentral_sms_messages', timestamps: true })
export class RingCentralSmsMessage {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  connectionId: string;

  @Prop({ required: true, index: true })
  threadId: string;

  @Prop()
  brandId?: string;

  @Prop()
  entityType?: string;

  @Prop()
  entityId?: string;

  @Prop({ required: true, index: true })
  providerMessageId: string;

  @Prop({ index: true })
  providerConversationId?: string;

  @Prop({ required: true, enum: ['Inbound', 'Outbound'] })
  direction: RingCentralSmsDirection;

  @Prop()
  fromPhoneNumber?: string;

  @Prop()
  fromName?: string;

  @Prop({ type: [String], default: [] })
  toPhoneNumbers: string[];

  @Prop({ type: [String], default: [] })
  toNames: string[];

  @Prop()
  subject?: string;

  @Prop()
  messageStatus?: string;

  @Prop()
  readStatus?: string;

  @Prop()
  sentAt?: Date;

  @Prop()
  deliveryTime?: Date;

  @Prop()
  lastModifiedTime?: Date;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ type: Object })
  lastProviderPayload?: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RingCentralSmsMessageSchema = SchemaFactory.createForClass(RingCentralSmsMessage);

RingCentralSmsMessageSchema.index(
  { organizationId: 1, providerMessageId: 1 },
  { unique: true },
);
RingCentralSmsMessageSchema.index({ organizationId: 1, threadId: 1, sentAt: 1 });
RingCentralSmsMessageSchema.index({ organizationId: 1, entityType: 1, entityId: 1, sentAt: -1 });

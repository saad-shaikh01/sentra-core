import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RingCentralSmsThreadDocument = HydratedDocument<RingCentralSmsThread>;
export type RingCentralSmsDirection = 'Inbound' | 'Outbound';

@Schema({ collection: 'ringcentral_sms_threads', timestamps: true })
export class RingCentralSmsThread {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  connectionId: string;

  @Prop()
  brandId?: string;

  @Prop()
  entityType?: string;

  @Prop()
  entityId?: string;

  @Prop()
  contactName?: string;

  @Prop({ required: true })
  participantPhoneNumber: string;

  @Prop()
  participantName?: string;

  @Prop({ index: true })
  providerConversationId?: string;

  @Prop()
  fromPhoneNumber?: string;

  @Prop({ default: 0 })
  messageCount: number;

  @Prop({ default: 0 })
  unreadCount: number;

  @Prop()
  lastMessageAt?: Date;

  @Prop()
  lastInboundAt?: Date;

  @Prop()
  lastOutboundAt?: Date;

  @Prop()
  snippet?: string;

  @Prop({ enum: ['Inbound', 'Outbound'] })
  lastMessageDirection?: RingCentralSmsDirection;

  @Prop()
  lastMessageStatus?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RingCentralSmsThreadSchema = SchemaFactory.createForClass(RingCentralSmsThread);

RingCentralSmsThreadSchema.index(
  { organizationId: 1, connectionId: 1, participantPhoneNumber: 1 },
  { unique: true },
);
RingCentralSmsThreadSchema.index(
  { organizationId: 1, connectionId: 1, providerConversationId: 1 },
  { sparse: true },
);
RingCentralSmsThreadSchema.index({ organizationId: 1, userId: 1, lastMessageAt: -1 });
RingCentralSmsThreadSchema.index({ organizationId: 1, entityType: 1, entityId: 1, lastMessageAt: -1 });

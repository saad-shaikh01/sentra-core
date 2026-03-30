import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RingCentralWebhookEventDocument = HydratedDocument<RingCentralWebhookEvent>;
export type RingCentralWebhookEventStatus =
  | 'pending'
  | 'processed'
  | 'failed'
  | 'ignored';

@Schema({ collection: 'ringcentral_webhook_events', timestamps: true })
export class RingCentralWebhookEvent {
  @Prop({ index: true })
  organizationId?: string;

  @Prop({ index: true })
  userId?: string;

  @Prop({ index: true })
  connectionId?: string;

  @Prop({ index: true })
  providerSubscriptionId?: string;

  @Prop({ index: true })
  providerEventId?: string;

  @Prop()
  ownerId?: string;

  @Prop()
  eventType?: string;

  @Prop()
  validationTokenHeader?: string;

  @Prop({ required: true, enum: ['pending', 'processed', 'failed', 'ignored'], default: 'pending' })
  processingStatus: RingCentralWebhookEventStatus;

  @Prop({ required: true, default: () => new Date(), index: true })
  receivedAt: Date;

  @Prop()
  processedAt?: Date;

  @Prop()
  errorMessage?: string;

  @Prop()
  telephonySessionId?: string;

  @Prop()
  sessionId?: string;

  @Prop()
  partyId?: string;

  @Prop()
  sequence?: number;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ type: Object })
  processingSummary?: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RingCentralWebhookEventSchema =
  SchemaFactory.createForClass(RingCentralWebhookEvent);

RingCentralWebhookEventSchema.index({ providerEventId: 1 }, { sparse: true, unique: true });
RingCentralWebhookEventSchema.index({ processingStatus: 1, receivedAt: -1 });
RingCentralWebhookEventSchema.index({ connectionId: 1, receivedAt: -1 });

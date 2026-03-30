import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RingCentralCallSessionDocument = HydratedDocument<RingCentralCallSession>;
export type RingCentralCallStatus =
  | 'queued'
  | 'dialing'
  | 'connected'
  | 'finished'
  | 'cancelled'
  | 'failed';

@Schema({ collection: 'ringcentral_call_sessions', timestamps: true })
export class RingCentralCallSession {
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

  @Prop()
  matchedPhoneNumber?: string;

  @Prop({ required: true })
  toPhoneNumber: string;

  @Prop()
  fromPhoneNumber?: string;

  @Prop()
  fromName?: string;

  @Prop()
  toName?: string;

  @Prop()
  ringOutId?: string;

  @Prop()
  ringOutUri?: string;

  @Prop({ index: true })
  sessionId?: string;

  @Prop({ index: true })
  telephonySessionId?: string;

  @Prop({ index: true })
  partyId?: string;

  @Prop()
  direction?: string;

  @Prop({ default: false })
  missedCall?: boolean;

  @Prop()
  eventTime?: Date;

  @Prop()
  disposition?: string;

  @Prop()
  notes?: string;

  @Prop()
  notesUpdatedAt?: Date;

  @Prop()
  notesUpdatedByUserId?: string;

  @Prop({ default: 'ringout' })
  source?: 'ringout' | 'webhook';

  @Prop({
    required: true,
    enum: ['queued', 'dialing', 'connected', 'finished', 'cancelled', 'failed'],
    default: 'queued',
  })
  callStatus: RingCentralCallStatus;

  @Prop()
  providerCallStatus?: string;

  @Prop()
  providerCallerStatus?: string;

  @Prop()
  providerCalleeStatus?: string;

  @Prop()
  failureReason?: string;

  @Prop()
  lastPolledAt?: Date;

  @Prop({ type: Object })
  lastProviderPayload?: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RingCentralCallSessionSchema =
  SchemaFactory.createForClass(RingCentralCallSession);

RingCentralCallSessionSchema.index({ organizationId: 1, userId: 1, createdAt: -1 });
RingCentralCallSessionSchema.index({ organizationId: 1, connectionId: 1, callStatus: 1, updatedAt: -1 });
RingCentralCallSessionSchema.index({ organizationId: 1, entityType: 1, entityId: 1, createdAt: -1 });
RingCentralCallSessionSchema.index({ organizationId: 1, telephonySessionId: 1, partyId: 1 });

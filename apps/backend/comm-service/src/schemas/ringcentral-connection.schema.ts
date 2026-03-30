import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RingCentralConnectionDocument = HydratedDocument<RingCentralConnection>;

export class RingCentralPhoneNumber {
  id?: string;
  phoneNumber: string;
  usageType?: string;
  type?: string;
  features: string[];
}

export class RingCentralConnectionState {
  status: 'active' | 'error' | 'reauthorization_required';
  lastError?: string;
  lastSeenAt?: Date;
}

export class RingCentralWebhookState {
  status: 'inactive' | 'pending' | 'active' | 'expiring' | 'expired' | 'error';
  subscriptionId?: string;
  validationTokenHash?: string;
  deliveryAddress?: string;
  eventFilters?: string[];
  expiresAt?: Date;
  lastEventAt?: Date;
  lastError?: string;
  lastSyncedAt?: Date;
}

@Schema({ collection: 'ringcentral_connections', timestamps: true })
export class RingCentralConnection {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop()
  brandId?: string;

  @Prop({ required: true })
  accountId: string;

  @Prop({ required: true })
  extensionId: string;

  @Prop()
  extensionNumber?: string;

  @Prop()
  displayName?: string;

  @Prop()
  email?: string;

  @Prop()
  serverUrl?: string;

  /** AES-256-GCM encrypted token blob: base64(iv[12] + authTag[16] + ciphertext) */
  @Prop({ required: true })
  encryptedAccessToken: string;

  @Prop({ required: true })
  encryptedRefreshToken: string;

  @Prop()
  tokenExpiresAt?: Date;

  @Prop({ type: [String], default: [] })
  scopes: string[];

  @Prop({ type: [Object], default: [] })
  phoneNumbers: RingCentralPhoneNumber[];

  @Prop()
  mainPhoneNumber?: string;

  @Prop({ type: [String], default: [] })
  directPhoneNumbers: string[];

  @Prop({ type: [String], default: [] })
  smsSenderPhoneNumbers: string[];

  @Prop()
  defaultOutboundPhoneNumber?: string;

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Object, default: { status: 'active' } })
  connectionState: RingCentralConnectionState;

  @Prop({ type: Object, default: { status: 'inactive' } })
  webhookState: RingCentralWebhookState;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RingCentralConnectionSchema = SchemaFactory.createForClass(RingCentralConnection);

RingCentralConnectionSchema.index(
  { organizationId: 1, accountId: 1, extensionId: 1 },
  { unique: true },
);
RingCentralConnectionSchema.index({ organizationId: 1, userId: 1, isActive: 1 });
RingCentralConnectionSchema.index({ organizationId: 1, isDefault: 1, isActive: 1 });

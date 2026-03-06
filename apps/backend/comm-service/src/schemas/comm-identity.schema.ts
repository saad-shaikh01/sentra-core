import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommIdentityDocument = HydratedDocument<CommIdentity>;

export class SendAsAlias {
  email: string;
  name?: string;
  isDefault: boolean;
}

export class SyncState {
  historyId?: string;
  lastSyncAt?: Date;
  initialSyncDone: boolean;
  fullBackfillDone: boolean;
  status: 'active' | 'error' | 'paused';
  lastError?: string;
}

@Schema({ collection: 'comm_identities', timestamps: true })
export class CommIdentity {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  displayName?: string;

  /** AES-256-GCM encrypted token blob: base64(iv[12] + authTag[16] + ciphertext) */
  @Prop({ required: true })
  encryptedAccessToken: string;

  @Prop({ required: true })
  encryptedRefreshToken: string;

  @Prop()
  tokenExpiresAt?: Date;

  @Prop({ type: [Object], default: [] })
  sendAsAliases: SendAsAlias[];

  @Prop()
  brandId?: string;

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ type: Object, default: { initialSyncDone: false, fullBackfillDone: false, status: 'active' } })
  syncState: SyncState;

  @Prop({ default: true })
  isActive: boolean;
}

export const CommIdentitySchema = SchemaFactory.createForClass(CommIdentity);

CommIdentitySchema.index({ organizationId: 1, email: 1 }, { unique: true });
CommIdentitySchema.index({ organizationId: 1, userId: 1 });

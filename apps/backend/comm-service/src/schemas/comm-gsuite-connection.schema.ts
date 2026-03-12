import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommGSuiteConnectionDocument = HydratedDocument<CommGSuiteConnection>;

@Schema({ collection: 'comm_gsuite_connections', timestamps: true })
export class CommGSuiteConnection {
  @Prop({ required: true, unique: true, index: true })
  organizationId: string;

  /** Google Workspace admin who connected */
  @Prop({ required: true })
  connectedByUserId: string;

  @Prop({ required: true })
  adminEmail: string;

  /** Extracted domain from adminEmail, e.g. "company.com" */
  @Prop({ required: true })
  domain: string;

  /** AES-256-GCM encrypted access token blob */
  @Prop({ required: true })
  encryptedAccessToken: string;

  /** AES-256-GCM encrypted refresh token blob */
  @Prop({ required: true })
  encryptedRefreshToken: string;

  @Prop()
  tokenExpiresAt?: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const CommGSuiteConnectionSchema = SchemaFactory.createForClass(CommGSuiteConnection);

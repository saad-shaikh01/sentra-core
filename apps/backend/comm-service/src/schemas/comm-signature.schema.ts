import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommSignatureDocument = HydratedDocument<CommSignature>;

@Schema({ collection: 'comm_signatures', timestamps: true })
export class CommSignature {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  createdBy: string;

  /** If set, this signature is tied to a specific identity; null = org-wide */
  @Prop()
  identityId?: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  bodyHtml: string;

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ default: false })
  isArchived: boolean;
}

export const CommSignatureSchema = SchemaFactory.createForClass(CommSignature);
CommSignatureSchema.index({ organizationId: 1, identityId: 1, isArchived: 1 });

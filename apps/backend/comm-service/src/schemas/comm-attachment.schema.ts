import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommAttachmentDocument = HydratedDocument<CommAttachment>;

@Schema({ collection: 'comm_attachments', timestamps: true })
export class CommAttachment {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  gmailMessageId: string;

  @Prop({ required: true })
  gmailAttachmentId: string;

  @Prop({ required: true })
  filename: string;

  @Prop()
  mimeType?: string;

  @Prop({ default: 0 })
  size: number;

  @Prop()
  s3Key?: string;

  @Prop()
  s3Bucket?: string;

  @Prop()
  archivedAt?: Date;

  @Prop({ default: 'PENDING', enum: ['PENDING', 'ARCHIVED', 'FAILED'] })
  archiveStatus: string;
}

export const CommAttachmentSchema = SchemaFactory.createForClass(CommAttachment);

CommAttachmentSchema.index({ organizationId: 1, gmailMessageId: 1 });
CommAttachmentSchema.index({ archiveStatus: 1, organizationId: 1 });

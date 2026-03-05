import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommMessageDocument = HydratedDocument<CommMessage>;

export class EmailAddress {
  email: string;
  name?: string;
}

export class MessageAttachmentRef {
  filename: string;
  mimeType: string;
  size: number;
  gmailAttachmentId?: string;
  s3Key?: string;
  archivedAt?: Date;
}

@Schema({ collection: 'comm_messages', timestamps: true })
export class CommMessage {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  gmailThreadId: string;

  @Prop({ required: true })
  gmailMessageId: string;

  @Prop({ required: true })
  identityId: string;

  @Prop({ type: Object, required: true })
  from: EmailAddress;

  @Prop({ type: [Object], default: [] })
  to: EmailAddress[];

  @Prop({ type: [Object], default: [] })
  cc: EmailAddress[];

  @Prop({ type: [Object], default: [] })
  bcc: EmailAddress[];

  @Prop()
  subject?: string;

  @Prop()
  bodyText?: string;

  @Prop()
  bodyHtml?: string;

  @Prop({ type: [Object], default: [] })
  attachments: MessageAttachmentRef[];

  @Prop()
  sentAt?: Date;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ default: false })
  isSentByIdentity: boolean;

  @Prop({ type: [String], default: [] })
  gmailLabels: string[];
}

export const CommMessageSchema = SchemaFactory.createForClass(CommMessage);

CommMessageSchema.index({ organizationId: 1, gmailMessageId: 1 }, { unique: true });
CommMessageSchema.index({ organizationId: 1, gmailThreadId: 1, sentAt: 1 });

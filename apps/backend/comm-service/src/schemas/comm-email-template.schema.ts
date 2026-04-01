import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommEmailTemplateDocument = HydratedDocument<CommEmailTemplate>;

@Schema({ collection: 'comm_email_templates', timestamps: true })
export class CommEmailTemplate {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  subject?: string;

  @Prop()
  bodyHtml?: string;

  @Prop()
  bodyText?: string;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ default: false })
  isArchived: boolean;
}

export const CommEmailTemplateSchema = SchemaFactory.createForClass(CommEmailTemplate);
CommEmailTemplateSchema.index({ organizationId: 1, isArchived: 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommEntityLinkDocument = HydratedDocument<CommEntityLink>;

@Schema({ collection: 'comm_entity_links', timestamps: true })
export class CommEntityLink {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true })
  entityType: string;

  @Prop({ required: true })
  entityId: string;

  @Prop({ required: true })
  gmailThreadId: string;

  @Prop({ required: true })
  linkedBy: 'AUTO' | 'MANUAL';

  @Prop({ required: true })
  linkedByUserId: string;
}

export const CommEntityLinkSchema = SchemaFactory.createForClass(CommEntityLink);

CommEntityLinkSchema.index(
  { organizationId: 1, entityType: 1, entityId: 1, gmailThreadId: 1 },
  { unique: true },
);
CommEntityLinkSchema.index({ organizationId: 1, gmailThreadId: 1 });
CommEntityLinkSchema.index({ organizationId: 1, entityType: 1, entityId: 1 });

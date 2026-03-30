import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommSettingsDocument = HydratedDocument<CommSettings>;
export type CommSensitivity = 'low' | 'medium' | 'high';

@Schema({ collection: 'comm_settings', timestamps: true })
export class CommSettings {
  @Prop({ required: true })
  organizationId: string;

  @Prop({ default: true })
  trackingEnabled: boolean;

  @Prop({ default: true })
  openTrackingEnabled: boolean;

  @Prop({ default: true })
  allowPerMessageTrackingToggle: boolean;

  @Prop({ default: 7, min: 2, max: 30 })
  ghostedAfterDays: number;

  @Prop({ enum: ['low', 'medium', 'high'], default: 'medium' })
  silenceSensitivity: CommSensitivity;

  @Prop({ enum: ['low', 'medium', 'high'], default: 'medium' })
  engagementSensitivity: CommSensitivity;

  @Prop({ default: true })
  inAppAlertsEnabled: boolean;

  @Prop({ default: false })
  emailAlertsEnabled: boolean;

  @Prop({ default: true })
  multipleOpenAlertsEnabled: boolean;

  @Prop({ default: 3, min: 2, max: 10 })
  multipleOpenThreshold: number;

  @Prop({ default: true })
  hotLeadAlertsEnabled: boolean;

  @Prop({ default: true })
  overdueAlertsEnabled: boolean;

  @Prop()
  updatedByUserId?: string;
}

export const CommSettingsSchema = SchemaFactory.createForClass(CommSettings);

CommSettingsSchema.index({ organizationId: 1 }, { unique: true });

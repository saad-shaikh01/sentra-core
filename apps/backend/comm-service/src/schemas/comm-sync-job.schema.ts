import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommSyncJobDocument = HydratedDocument<CommSyncJob>;

export type SyncJobType = 'full_sync' | 'backfill_sync' | 'incremental' | 'attachment_archive';
export type SyncJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dlq';

@Schema({ collection: 'comm_sync_jobs', timestamps: true })
export class CommSyncJob {
  @Prop({ required: true, index: true })
  organizationId: string;

  @Prop({ required: true, index: true })
  identityId: string;

  @Prop({ required: true, enum: ['full_sync', 'backfill_sync', 'incremental', 'attachment_archive'] })
  jobType: SyncJobType;

  @Prop({ required: true, enum: ['pending', 'running', 'completed', 'failed', 'dlq'], default: 'pending' })
  status: SyncJobStatus;

  @Prop()
  bullJobId?: string;

  @Prop({ type: Object })
  payload?: Record<string, any>;

  @Prop({ type: Object })
  errorDetails?: {
    message: string;
    stack?: string;
    attemptsMade: number;
  };

  @Prop({ default: 0 })
  messagesProcessed: number;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;
}

export const CommSyncJobSchema = SchemaFactory.createForClass(CommSyncJob);
CommSyncJobSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
CommSyncJobSchema.index({ identityId: 1, jobType: 1, status: 1 });

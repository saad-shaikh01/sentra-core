import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommIdentity, CommIdentitySchema } from './comm-identity.schema';
import { CommThread, CommThreadSchema } from './comm-thread.schema';
import { CommMessage, CommMessageSchema } from './comm-message.schema';
import { CommEntityLink, CommEntityLinkSchema } from './comm-entity-link.schema';
import { CommAttachment, CommAttachmentSchema } from './comm-attachment.schema';
import { CommSyncJob, CommSyncJobSchema } from './comm-sync-job.schema';
import { CommAuditLog, CommAuditLogSchema } from './comm-audit-log.schema';
import { CommMessageEvent, CommMessageEventSchema } from './comm-message-event.schema';
import {
  CommMessageTrackingToken,
  CommMessageTrackingTokenSchema,
} from './comm-message-tracking-token.schema';

const schemas = MongooseModule.forFeature([
  { name: CommIdentity.name, schema: CommIdentitySchema },
  { name: CommThread.name, schema: CommThreadSchema },
  { name: CommMessage.name, schema: CommMessageSchema },
  { name: CommEntityLink.name, schema: CommEntityLinkSchema },
  { name: CommAttachment.name, schema: CommAttachmentSchema },
  { name: CommSyncJob.name, schema: CommSyncJobSchema },
  { name: CommAuditLog.name, schema: CommAuditLogSchema },
  { name: CommMessageEvent.name, schema: CommMessageEventSchema },
  { name: CommMessageTrackingToken.name, schema: CommMessageTrackingTokenSchema },
]);

@Module({
  imports: [schemas],
  exports: [schemas],
})
export class CommSchemasModule {}

import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { SyncModule } from '../sync/sync.module';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController, AttachmentUploadController } from './attachments.controller';

@Module({
  imports: [
    CommSchemasModule,
    SyncModule,
    MulterModule.register({ limits: { fileSize: 25 * 1024 * 1024 } }), // 25MB limit
  ],
  controllers: [AttachmentsController, AttachmentUploadController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}

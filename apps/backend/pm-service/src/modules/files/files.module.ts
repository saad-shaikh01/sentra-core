/**
 * FilesModule — PM-BE-017
 *
 * Upload-once, link-many file metadata layer.
 * Actual binary storage lives in Wasabi/S3 — this module only tracks metadata.
 */

import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}

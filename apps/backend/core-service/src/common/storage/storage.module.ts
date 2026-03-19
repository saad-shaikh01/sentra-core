import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { StorageProvisioningService } from './storage-provisioning.service';

@Module({
  providers: [StorageService, StorageProvisioningService],
  exports: [StorageService, StorageProvisioningService],
})
export class StorageModule {}

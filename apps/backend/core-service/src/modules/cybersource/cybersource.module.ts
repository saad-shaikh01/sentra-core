import { Module } from '@nestjs/common';
import { CyberSourceService } from './cybersource.service';

@Module({
  providers: [CyberSourceService],
  exports: [CyberSourceService],
})
export class CyberSourceModule {}

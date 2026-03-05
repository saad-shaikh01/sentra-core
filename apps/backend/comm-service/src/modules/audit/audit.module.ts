import { Global, Module } from '@nestjs/common';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

@Global()
@Module({
  imports: [CommSchemasModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

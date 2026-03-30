import { Module } from '@nestjs/common';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { SettingsModule } from '../settings/settings.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [CommSchemasModule, SettingsModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}

import { Module } from '@nestjs/common';
import { CommSchemasModule } from '../../schemas/comm-schemas.module';
import { CommSettingsController } from './comm-settings.controller';
import { CommSettingsService } from './comm-settings.service';

@Module({
  imports: [CommSchemasModule],
  controllers: [CommSettingsController],
  providers: [CommSettingsService],
  exports: [CommSettingsService],
})
export class SettingsModule {}

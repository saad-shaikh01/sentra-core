import { Module } from '@nestjs/common';
import { PmEventsGateway } from './pm-events.gateway';

@Module({
  providers: [PmEventsGateway],
  exports: [PmEventsGateway],
})
export class PmGatewayModule {}

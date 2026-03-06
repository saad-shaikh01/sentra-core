import { Global, Module } from '@nestjs/common';
import { CommGateway } from './comm.gateway';

/**
 * GatewayModule — global so any service can inject CommGateway
 * without explicitly importing this module.
 */
@Global()
@Module({
  providers: [CommGateway],
  exports: [CommGateway],
})
export class GatewayModule {}

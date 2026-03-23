import { Module } from '@nestjs/common';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { AuthorizeNetModule } from '../authorize-net/authorize-net.module';

@Module({
  imports: [AuthorizeNetModule],
  providers: [PaymentGatewayFactory],
  exports: [PaymentGatewayFactory],
})
export class PaymentGatewayModule {}

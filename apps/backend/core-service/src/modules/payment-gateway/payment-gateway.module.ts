import { Module } from '@nestjs/common';
import { PaymentGatewayFactory } from './payment-gateway.factory';
import { AuthorizeNetModule } from '../authorize-net/authorize-net.module';
import { CyberSourceModule } from '../cybersource/cybersource.module';

@Module({
  imports: [AuthorizeNetModule, CyberSourceModule],
  providers: [PaymentGatewayFactory],
  exports: [PaymentGatewayFactory],
})
export class PaymentGatewayModule {}

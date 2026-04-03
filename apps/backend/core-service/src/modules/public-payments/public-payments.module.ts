import { Module } from '@nestjs/common';
import { PaymentGatewayModule } from '../payment-gateway';
import { CyberSourceModule } from '../cybersource/cybersource.module';
import { PublicPaymentsController } from './public-payments.controller';
import { PublicPaymentsService } from './public-payments.service';

@Module({
  imports: [PaymentGatewayModule, CyberSourceModule],
  controllers: [PublicPaymentsController],
  providers: [PublicPaymentsService],
})
export class PublicPaymentsModule {}

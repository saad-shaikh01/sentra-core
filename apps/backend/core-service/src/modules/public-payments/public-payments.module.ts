import { Module } from '@nestjs/common';
import { PaymentGatewayModule } from '../payment-gateway';
import { PublicPaymentsController } from './public-payments.controller';
import { PublicPaymentsService } from './public-payments.service';

@Module({
  imports: [PaymentGatewayModule],
  controllers: [PublicPaymentsController],
  providers: [PublicPaymentsService],
})
export class PublicPaymentsModule {}

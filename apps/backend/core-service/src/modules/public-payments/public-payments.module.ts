import { Module } from '@nestjs/common';
import { AuthorizeNetModule } from '../authorize-net/authorize-net.module';
import { PublicPaymentsController } from './public-payments.controller';
import { PublicPaymentsService } from './public-payments.service';

@Module({
  imports: [AuthorizeNetModule],
  controllers: [PublicPaymentsController],
  providers: [PublicPaymentsService],
})
export class PublicPaymentsModule {}

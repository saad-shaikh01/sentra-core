import { Body, Controller, Get, Param, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators';
import { PublicInvoiceDto } from './dto/public-invoice.dto';
import { PublicPaymentDto } from './dto/public-payment.dto';
import { PublicPaymentsService } from './public-payments.service';

@Controller('public')
export class PublicPaymentsController {
  constructor(private readonly publicPaymentsService: PublicPaymentsService) {}

  @Get('invoice/:token')
  @Public()
  getInvoice(@Param('token') token: string): Promise<PublicInvoiceDto> {
    return this.publicPaymentsService.getInvoiceByToken(token);
  }

  @Post('invoice/:token/pay')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  pay(
    @Param('token') token: string,
    @Body() dto: PublicPaymentDto,
  ) {
    return this.publicPaymentsService.payInvoice(token, dto);
  }

  /**
   * Stripe-only: Creates a PaymentIntent and returns a clientSecret.
   * The frontend uses this with Stripe.js to confirm payment.
   * Stripe webhook will then mark the invoice as paid.
   */
  @Post('invoice/:token/create-payment-intent')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  createPaymentIntent(@Param('token') token: string) {
    return this.publicPaymentsService.createStripePaymentIntent(token);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatewayType } from '@sentra-core/types';
import { AuthorizeNetService } from '../authorize-net/authorize-net.service';
import { IPaymentGateway } from './interfaces/payment-gateway.interface';
import { AuthorizeNetGateway } from './gateways/authorize-net.gateway';
import { StripeGateway } from './gateways/stripe.gateway';
import { ManualGateway } from './gateways/manual.gateway';

@Injectable()
export class PaymentGatewayFactory {
  private readonly logger = new Logger(PaymentGatewayFactory.name);

  constructor(
    private readonly config: ConfigService,
    private readonly authorizeNetService: AuthorizeNetService,
  ) {}

  resolve(gatewayType: GatewayType): IPaymentGateway {
    switch (gatewayType) {
      case GatewayType.AUTHORIZE_NET:
        return new AuthorizeNetGateway(this.authorizeNetService);
      case GatewayType.STRIPE:
        return new StripeGateway(this.config);
      case GatewayType.MANUAL:
        return new ManualGateway();
      default:
        this.logger.warn(`Unknown gateway type "${gatewayType}", defaulting to AUTHORIZE_NET`);
        return new AuthorizeNetGateway(this.authorizeNetService);
    }
  }
}

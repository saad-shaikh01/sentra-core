import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/decorators';
import { SkipThrottle } from '@nestjs/throttler';
import { WebhooksService } from './webhooks.service';
import { AuthorizeNetWebhookPayload } from './dto/authorize-net-webhook.dto';

@SkipThrottle()
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @Public()
  @Post('authorize-net')
  @HttpCode(200)
  async handleAuthorizeNetWebhook(
    @Req() req: Request,
    @Headers('x-anet-signature') signatureHeader: string,
  ): Promise<{ received: boolean }> {
    const requestBody = req.body as Buffer | string | Record<string, unknown> | undefined;
    const rawBody = Buffer.isBuffer(requestBody)
      ? requestBody.toString('utf8')
      : ((req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(requestBody) ?? '');

    if (!this.webhooksService.verifyAuthorizeNetSignature(rawBody, signatureHeader ?? '')) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let payload: AuthorizeNetWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { received: true };
    }

    this.webhooksService.processEvent(payload).catch((err) =>
      this.logger.error('Webhook processing error', err),
    );

    return { received: true };
  }
}

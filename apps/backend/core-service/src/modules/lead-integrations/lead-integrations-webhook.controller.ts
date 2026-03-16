import { BadRequestException, Controller, Get, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../auth/decorators';
import { LeadIntegrationsService } from './lead-integrations.service';

@SkipThrottle()
@Controller('webhooks')
export class LeadIntegrationsWebhookController {
  constructor(private readonly leadIntegrationsService: LeadIntegrationsService) {}

  @Public()
  @Get('facebook-leads')
  verifyFacebookWebhook(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ): Promise<string> {
    return this.leadIntegrationsService.verifyFacebookWebhook(
      mode,
      verifyToken,
      challenge,
    );
  }

  @Public()
  @Post('facebook-leads')
  @HttpCode(200)
  handleFacebookWebhook(
    @Query('webhookId') webhookId?: string,
    @Headers('x-hub-signature-256') signature?: string,
    @Req() req?: Request,
  ): Promise<{ received: true; processed: number }> {
    if (!req) {
      throw new BadRequestException('Request body is required');
    }

    return this.leadIntegrationsService.handleFacebookWebhook(
      webhookId ?? '',
      signature ?? '',
      req.body as Record<string, unknown>,
    );
  }
}

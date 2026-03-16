import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { GenericLeadWebhooksController } from './generic-lead-webhooks.controller';
import { LeadIntegrationsController } from './lead-integrations.controller';
import { LeadIntegrationsService } from './lead-integrations.service';
import { LeadIntegrationsWebhookController } from './lead-integrations-webhook.controller';

@Module({
  imports: [LeadsModule],
  controllers: [
    LeadIntegrationsController,
    GenericLeadWebhooksController,
    LeadIntegrationsWebhookController,
  ],
  providers: [LeadIntegrationsService],
  exports: [LeadIntegrationsService],
})
export class LeadIntegrationsModule {}

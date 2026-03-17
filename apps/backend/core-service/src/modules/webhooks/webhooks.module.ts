import { Module } from '@nestjs/common';
import { PrismaClientModule } from '@sentra-core/prisma-client';
import { SalesModule } from '../sales';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [PrismaClientModule, SalesModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}

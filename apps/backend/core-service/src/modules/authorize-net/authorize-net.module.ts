import { Module } from '@nestjs/common';
import { AuthorizeNetService } from './authorize-net.service';
import { AuthorizeNetWebhookController } from './authorize-net-webhook.controller';

@Module({
  controllers: [AuthorizeNetWebhookController],
  providers: [AuthorizeNetService],
  exports: [AuthorizeNetService],
})
export class AuthorizeNetModule {}

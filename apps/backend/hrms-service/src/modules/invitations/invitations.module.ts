import { Module } from '@nestjs/common';
import { MailerService } from '../../common/mailer';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  controllers: [InvitationsController],
  providers: [InvitationsService, MailerService],
  exports: [InvitationsService],
})
export class InvitationsModule {}

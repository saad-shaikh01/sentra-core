import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface InviteEmailPayload {
  to: string;
  firstName: string;
  inviterName: string;
  organizationName: string;
  inviteUrl: string;
  appName: string;
  expiresIn?: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly config: ConfigService) {}

  async sendInviteEmail(payload: InviteEmailPayload): Promise<void> {
    const smtpHost = this.config.get<string>('SMTP_HOST');
    if (!smtpHost) {
      this.logger.warn(
        `SMTP_HOST is not configured. Invite link for ${payload.to}: ${payload.inviteUrl}`,
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER'),
            pass: this.config.get<string>('SMTP_PASS'),
          }
        : undefined,
    });

    await transporter.sendMail({
      from: this.config.get<string>('SMTP_FROM', 'no-reply@sentra.local'),
      to: payload.to,
      subject: `You've been invited to ${payload.organizationName} on Sentra`,
      text: [
        `Hi ${payload.firstName || 'there'},`,
        '',
        `${payload.inviterName} has invited you to join ${payload.organizationName} on ${payload.appName}.`,
        '',
        `Accept your invitation: ${payload.inviteUrl}`,
        '',
        `This invitation expires ${payload.expiresIn ?? 'in 72 hours'}.`,
      ].join('\n'),
    });
  }
}
